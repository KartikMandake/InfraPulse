// ==============================================================================
// InfraPulse - AWS Read-Only Cloud Provider & Resource Discovery
// Phase 23D: Strictly Read-Only Discovery using AWS SDK v3
//
// Safety Guarantees:
// 1. Strictly Read-Only: Only STS:GetCallerIdentity, EC2:Describe*, RDS:Describe*
// 2. Zero Mutating Calls: No Run/Start/Stop/Reboot/Terminate/Create/Delete/Modify
// 3. No Stored Credentials: Never requests, logs, or persists access keys or secrets
// 4. Region Restricted: ap-south-1 default with strict region validation
// 5. Sensitive Data Redaction: Account IDs and ARNs are masked in responses and logs
// ==============================================================================

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeAddressesCommand
} from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';

// Standard published On-Demand hourly pricing estimates for ap-south-1 (Mumbai)
export const AP_SOUTH_1_PRICING = {
  ec2: {
    't4g.nano': 0.0042,
    't4g.micro': 0.0084,
    't4g.small': 0.0168,
    't4g.medium': 0.0336,
    't3.nano': 0.0052,
    't3.micro': 0.0104,
    't3.small': 0.0208,
    't3.medium': 0.0416,
    't2.nano': 0.0058,
    't2.micro': 0.0116,
    't2.small': 0.0230,
    't2.medium': 0.0460,
    default: 0.0200
  },
  ebs: {
    gp3: 0.08 / 730, // ~$0.0001095 / GB-hr
    gp2: 0.10 / 730,
    io1: 0.125 / 730,
    io2: 0.125 / 730,
    standard: 0.05 / 730,
    default: 0.08 / 730
  },
  publicIpv4: 0.0050, // $0.005 / hr per in-use or idle public IPv4
  rds: {
    'db.t4g.micro': 0.0180,
    'db.t4g.small': 0.0360,
    'db.t4g.medium': 0.0720,
    'db.t3.micro': 0.0180,
    'db.t3.small': 0.0360,
    'db.t2.micro': 0.0190,
    storagePerGb: 0.115 / 730,
    default: 0.0250
  }
};

export const ALLOWED_REGIONS = process.env.AWS_ALLOWED_REGIONS ? process.env.AWS_ALLOWED_REGIONS.split(',').map(s => s.trim()).filter(Boolean) : ['ap-south-1'];

/**
 * Mask sensitive AWS Account IDs to avoid exposing exact identifiers in UI or logs.
 * e.g., "123456789012" -> "********9012"
 */
export function maskAccountId(accountId) {
  if (!accountId || typeof accountId !== 'string') return '********';
  if (accountId.length <= 4) return '****';
  return '********' + accountId.slice(-4);
}

/**
 * Mask sensitive ARNs to obscure account IDs while keeping resource role/user visible.
 */
export function maskArn(arn) {
  if (!arn || typeof arn !== 'string') return 'arn:aws:iam::********:identity';
  return arn.replace(/::\d{12}:/, '::********:');
}

export class AwsReadOnlyProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.region='ap-south-1']
   * @param {Object} [options.clients] - Optional injected clients for unit tests
   */
  constructor({ region = 'ap-south-1', clients = {} } = {}) {
    this.region = region;
    this.clients = clients;
  }

  _validateRegion(targetRegion) {
    const reg = targetRegion || this.region;
    if (!ALLOWED_REGIONS.includes(reg)) {
      throw new Error(`Region '${reg}' is not permitted. InfraPulse AWS discovery is restricted to [${ALLOWED_REGIONS.join(', ')}].`);
    }
    return reg;
  }

  _getClient(service, region) {
    const effectiveRegion = this._validateRegion(region);
    if (this.clients[service]) {
      return this.clients[service];
    }

    const clientConfig = { region: effectiveRegion };
    switch (service) {
      case 'sts':
        return new STSClient(clientConfig);
      case 'ec2':
        return new EC2Client(clientConfig);
      case 'rds':
        return new RDSClient(clientConfig);
      default:
        throw new Error(`Unsupported AWS service client: ${service}`);
    }
  }

  /**
   * 1. STS: Verify AWS Caller Identity
   * Free, strictly read-only check to confirm credential validity and account status.
   */
  async getCallerIdentity({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const client = this._getClient('sts', effectiveRegion);

    try {
      const response = await client.send(new GetCallerIdentityCommand({}));
      return {
        connected: true,
        region: effectiveRegion,
        accountIdMasked: maskAccountId(response.Account),
        arnMasked: maskArn(response.Arn),
        userIdMasked: response.UserId ? response.UserId.slice(0, 4) + '****' : null,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        connected: false,
        region: effectiveRegion,
        error: err.name || 'AWSAuthenticationError',
        errorMessage: err.message || 'Unable to authenticate with AWS credentials provider chain.',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 2. EC2: DescribeInstances with full pagination
   */
  async describeInstances({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const client = this._getClient('ec2', effectiveRegion);

    const instances = [];
    let nextToken = undefined;

    do {
      const command = new DescribeInstancesCommand({
        NextToken: nextToken,
        MaxResults: 50
      });

      const response = await client.send(command);
      const reservations = response.Reservations || [];

      for (const res of reservations) {
        for (const inst of (res.Instances || [])) {
          // Skip terminated instances older than current cycle
          if (inst.State?.Name === 'terminated') continue;

          const tags = (inst.Tags || []).reduce((acc, t) => {
            if (t.Key && t.Value) acc[t.Key] = t.Value;
            return acc;
          }, {});

          const instanceType = inst.InstanceType || 't4g.small';
          const computeRate = AP_SOUTH_1_PRICING.ec2[instanceType] || AP_SOUTH_1_PRICING.ec2.default;
          const isRunning = inst.State?.Name === 'running';

          // Attached block devices
          const attachedVolumes = (inst.BlockDeviceMappings || []).map(bd => ({
            deviceName: bd.DeviceName,
            volumeId: bd.Ebs?.VolumeId,
            status: bd.Ebs?.Status,
            deleteOnTermination: bd.Ebs?.DeleteOnTermination
          }));

          const hasPublicIp = !!inst.PublicIpAddress;
          const ipv4Rate = hasPublicIp ? AP_SOUTH_1_PRICING.publicIpv4 : 0;
          const activeHourly = isRunning ? (computeRate + ipv4Rate) : 0;

          instances.push({
            id: `aws-${inst.InstanceId}`,
            name: tags.Name || `ec2-${inst.InstanceId}`,
            provider: 'aws',
            resource_type: 'ec2_instance',
            region: effectiveRegion,
            environment: tags.Environment || tags.env || 'live-aws',
            current_state: inst.State?.Name || 'unknown',
            estimated_hourly_cost: parseFloat(activeHourly.toFixed(4)),
            cost_breakdown: {
              compute: isRunning ? parseFloat(computeRate.toFixed(4)) : 0,
              storage: 0.0, // Storage accounted under separate EBS volume resource
              ipv4: parseFloat(ipv4Rate.toFixed(4)),
              networking: 0.0,
              managed: 0.0
            },
            dependencies: [],
            persistence_requirements: {
              volume_type: 'ebs',
              attached_volumes_count: attachedVolumes.length,
              delete_on_termination: attachedVolumes.some(v => v.deleteOnTermination)
            },
            is_critical_dependency: false,
            metadata: {
              instance_id: inst.InstanceId,
              instance_type: instanceType,
              availability_zone: inst.Placement?.AvailabilityZone,
              public_ip: inst.PublicIpAddress || null,
              private_ip: inst.PrivateIpAddress || null,
              vpc_id: inst.VpcId || null,
              subnet_id: inst.SubnetId || null,
              architecture: inst.Architecture || 'arm64',
              launch_time: inst.LaunchTime ? new Date(inst.LaunchTime).toISOString() : null,
              attached_volumes: attachedVolumes,
              tags,
              is_simulated: false,
              is_live_aws: true,
              discovery_source: 'aws_sdk'
            },
            last_lifecycle_operation: 'inspect',
            last_health_check_status: isRunning ? 'healthy' : 'stopped',
            last_health_check_at: new Date().toISOString()
          });
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return instances;
  }

  /**
   * 3. EC2: DescribeVolumes with full pagination
   */
  async describeVolumes({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const client = this._getClient('ec2', effectiveRegion);

    const volumes = [];
    let nextToken = undefined;

    do {
      const command = new DescribeVolumesCommand({
        NextToken: nextToken,
        MaxResults: 50
      });

      const response = await client.send(command);
      for (const vol of (response.Volumes || [])) {
        const tags = (vol.Tags || []).reduce((acc, t) => {
          if (t.Key && t.Value) acc[t.Key] = t.Value;
          return acc;
        }, {});

        const volType = vol.VolumeType || 'gp3';
        const sizeGb = vol.Size || 20;
        const ratePerGbHr = AP_SOUTH_1_PRICING.ebs[volType] || AP_SOUTH_1_PRICING.ebs.default;
        const hourlyStorageCost = sizeGb * ratePerGbHr;

        const attachments = (vol.Attachments || []).map(att => ({
          instanceId: att.InstanceId,
          device: att.Device,
          state: att.State,
          deleteOnTermination: att.DeleteOnTermination
        }));

        volumes.push({
          id: `aws-${vol.VolumeId}`,
          name: tags.Name || `ebs-${vol.VolumeId}`,
          provider: 'aws',
          resource_type: 'ebs_volume',
          region: effectiveRegion,
          environment: tags.Environment || tags.env || 'live-aws',
          current_state: vol.State || 'available',
          estimated_hourly_cost: parseFloat(hourlyStorageCost.toFixed(4)),
          cost_breakdown: {
            compute: 0.0,
            storage: parseFloat(hourlyStorageCost.toFixed(4)),
            ipv4: 0.0,
            networking: 0.0,
            managed: 0.0
          },
          dependencies: attachments.map(a => `aws-${a.instanceId}`),
          persistence_requirements: {
            volume_type: volType,
            volume_size_gb: sizeGb,
            iops: vol.Iops || null,
            throughput: vol.Throughput || null,
            encrypted: vol.Encrypted || false,
            delete_on_termination: attachments.some(a => a.deleteOnTermination)
          },
          is_critical_dependency: false,
          metadata: {
            volume_id: vol.VolumeId,
            volume_type: volType,
            size_gb: sizeGb,
            availability_zone: vol.AvailabilityZone,
            create_time: vol.CreateTime ? new Date(vol.CreateTime).toISOString() : null,
            attachments,
            tags,
            is_simulated: false,
            is_live_aws: true,
            discovery_source: 'aws_sdk'
          },
          last_lifecycle_operation: 'inspect',
          last_health_check_status: vol.State === 'in-use' ? 'healthy' : 'idle',
          last_health_check_at: new Date().toISOString()
        });
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return volumes;
  }

  /**
   * 4. EC2: DescribeAddresses (Elastic IP addresses)
   */
  async describeAddresses({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const client = this._getClient('ec2', effectiveRegion);

    const addresses = [];
    const response = await client.send(new DescribeAddressesCommand({}));

    for (const addr of (response.Addresses || [])) {
      const tags = (addr.Tags || []).reduce((acc, t) => {
        if (t.Key && t.Value) acc[t.Key] = t.Value;
        return acc;
      }, {});

      const isAssociated = !!addr.InstanceId || !!addr.NetworkInterfaceId;
      const hourlyCost = AP_SOUTH_1_PRICING.publicIpv4;

      addresses.push({
        id: `aws-eip-${addr.AllocationId || addr.PublicIp.replace(/\./g, '-')}`,
        name: tags.Name || `eip-${addr.PublicIp}`,
        provider: 'aws',
        resource_type: 'elastic_ip',
        region: effectiveRegion,
        environment: tags.Environment || 'live-aws',
        current_state: isAssociated ? 'associated' : 'unassociated',
        estimated_hourly_cost: parseFloat(hourlyCost.toFixed(4)),
        cost_breakdown: {
          compute: 0.0,
          storage: 0.0,
          ipv4: parseFloat(hourlyCost.toFixed(4)),
          networking: 0.0,
          managed: 0.0
        },
        dependencies: addr.InstanceId ? [`aws-${addr.InstanceId}`] : [],
        persistence_requirements: {
          is_static_ip: true,
          allocation_id: addr.AllocationId || null
        },
        is_critical_dependency: false,
        metadata: {
          public_ip: addr.PublicIp,
          allocation_id: addr.AllocationId,
          association_id: addr.AssociationId || null,
          instance_id: addr.InstanceId || null,
          network_interface_id: addr.NetworkInterfaceId || null,
          is_associated: isAssociated,
          tags,
          is_simulated: false,
          is_live_aws: true,
          discovery_source: 'aws_sdk'
        },
        last_lifecycle_operation: 'inspect',
        last_health_check_status: 'healthy',
        last_health_check_at: new Date().toISOString()
      });
    }

    return addresses;
  }

  /**
   * 5. RDS: DescribeDBInstances with full pagination
   */
  async describeDBInstances({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const client = this._getClient('rds', effectiveRegion);

    const databases = [];
    let marker = undefined;

    do {
      const command = new DescribeDBInstancesCommand({
        Marker: marker,
        MaxRecords: 50
      });

      const response = await client.send(command);
      for (const db of (response.DBInstances || [])) {
        const dbClass = db.DBInstanceClass || 'db.t4g.micro';
        const computeRate = AP_SOUTH_1_PRICING.rds[dbClass] || AP_SOUTH_1_PRICING.rds.default;
        const storageGb = db.AllocatedStorage || 20;
        const storageRate = storageGb * AP_SOUTH_1_PRICING.rds.storagePerGb;
        const isAvailable = db.DBInstanceStatus === 'available';

        const totalHourly = isAvailable ? (computeRate + storageRate) : storageRate;

        databases.push({
          id: `aws-rds-${db.DBInstanceIdentifier}`,
          name: db.DBInstanceIdentifier,
          provider: 'aws',
          resource_type: 'rds_instance',
          region: effectiveRegion,
          environment: 'live-aws',
          current_state: db.DBInstanceStatus || 'available',
          estimated_hourly_cost: parseFloat(totalHourly.toFixed(4)),
          cost_breakdown: {
            compute: isAvailable ? parseFloat(computeRate.toFixed(4)) : 0.0,
            storage: parseFloat(storageRate.toFixed(4)),
            ipv4: 0.0,
            networking: 0.0,
            managed: 0.0
          },
          dependencies: [],
          persistence_requirements: {
            storage_type: db.StorageType || 'gp3',
            allocated_storage_gb: storageGb,
            multi_az: db.MultiAZ || false,
            backup_retention_period: db.BackupRetentionPeriod || 7,
            deletion_protection: db.DeletionProtection || false
          },
          is_critical_dependency: true,
          metadata: {
            db_instance_identifier: db.DBInstanceIdentifier,
            db_instance_class: dbClass,
            engine: db.Engine,
            engine_version: db.EngineVersion,
            endpoint: db.Endpoint?.Address || null,
            port: db.Endpoint?.Port || 5432,
            availability_zone: db.AvailabilityZone,
            multi_az: db.MultiAZ || false,
            storage_encrypted: db.StorageEncrypted || false,
            create_time: db.InstanceCreateTime ? new Date(db.InstanceCreateTime).toISOString() : null,
            is_simulated: false,
            is_live_aws: true,
            discovery_source: 'aws_sdk'
          },
          last_lifecycle_operation: 'inspect',
          last_health_check_status: isAvailable ? 'healthy' : 'stopped',
          last_health_check_at: new Date().toISOString()
        });
      }

      marker = response.Marker;
    } while (marker);

    return databases;
  }

  /**
   * 6. DISCOVER ALL: Parallel strictly read-only sweep
   */
  async discoverAll({ region = this.region } = {}) {
    const effectiveRegion = this._validateRegion(region);
    const start = Date.now();

    // 1. Identity Verification
    const identity = await this.getCallerIdentity({ region: effectiveRegion });
    if (!identity.connected) {
      return {
        success: false,
        region: effectiveRegion,
        error: identity.error,
        errorMessage: identity.errorMessage,
        durationMs: Date.now() - start,
        discoveredResources: [],
        counts: { ec2: 0, ebs: 0, elasticIps: 0, rds: 0, total: 0 }
      };
    }

    // 2. Parallel Read-Only Inquiries
    const [ec2Result, ebsResult, eipResult, rdsResult] = await Promise.allSettled([
      this.describeInstances({ region: effectiveRegion }),
      this.describeVolumes({ region: effectiveRegion }),
      this.describeAddresses({ region: effectiveRegion }),
      this.describeDBInstances({ region: effectiveRegion })
    ]);

    const ec2 = ec2Result.status === 'fulfilled' ? ec2Result.value : [];
    const ebs = ebsResult.status === 'fulfilled' ? ebsResult.value : [];
    const eips = eipResult.status === 'fulfilled' ? eipResult.value : [];
    const rds = rdsResult.status === 'fulfilled' ? rdsResult.value : [];

    const errors = [];
    if (ec2Result.status === 'rejected') errors.push(`EC2: ${ec2Result.reason.message}`);
    if (ebsResult.status === 'rejected') errors.push(`EBS: ${ebsResult.reason.message}`);
    if (eipResult.status === 'rejected') errors.push(`EIP: ${eipResult.reason.message}`);
    if (rdsResult.status === 'rejected') errors.push(`RDS: ${rdsResult.reason.message}`);

    const allResources = [...ec2, ...ebs, ...eips, ...rds];
    const totalHourly = allResources.reduce((sum, r) => sum + r.estimated_hourly_cost, 0);

    return {
      success: true,
      region: effectiveRegion,
      identity,
      discoveredResources: allResources,
      counts: {
        ec2: ec2.length,
        ebs: ebs.length,
        elasticIps: eips.length,
        rds: rds.length,
        total: allResources.length
      },
      estimatedMonthlyCostUsd: parseFloat((totalHourly * 730).toFixed(2)),
      freeTierStatus: 'Not verified (Requires billing delegation)',
      errors: errors.length > 0 ? errors : null,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString()
    };
  }
}

