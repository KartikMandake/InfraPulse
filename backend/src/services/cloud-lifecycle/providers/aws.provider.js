// ==============================================================================
// InfraPulse - AWS Cloud Lifecycle Provider (Deterministic Simulation)
// Models EC2, RDS, and EKS workloads with strictly zero out-of-pocket budget
// ==============================================================================

import { MockCloudProvider } from './mock.provider.js';

export class AwsCloudProvider extends MockCloudProvider {
  constructor() {
    super('aws');
  }

  async stop(resource) {
    // Critical safety check for EBS / RDS persistence
    if (resource.persistence_requirements?.volume_type && resource.persistence_requirements.delete_on_termination) {
      throw new Error(`AWS Safety Violation: EBS volume on ${resource.id} has delete_on_termination=true. Modification blocked.`);
    }

    const res = await super.stop(resource);
    res.cloudProviderDetails = {
      instanceId: resource.metadata?.instance_id || 'i-simulated',
      region: resource.region || 'ap-south-1',
      ebsVolumeRetained: true,
      elasticIpDetached: false,
      ipv4HourlyChargeContinues: true
    };
    return res;
  }

  async start(resource) {
    const res = await super.start(resource);
    res.cloudProviderDetails = {
      instanceId: resource.metadata?.instance_id || 'i-simulated',
      region: resource.region || 'ap-south-1',
      publicIpAssigned: resource.metadata?.public_ip || '13.232.100.45',
      healthStatus: '2/2 checks passed'
    };
    return res;
  }
}

