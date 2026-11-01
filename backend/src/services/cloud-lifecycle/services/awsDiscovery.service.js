// ==============================================================================
// InfraPulse - AWS Discovery & Synchronization Service
// Phase 23D: Read-only AWS resource synchronization & Free Tier visibility
// ==============================================================================

import crypto from 'crypto';
import { query } from '../../../db/connection.js';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { AwsReadOnlyProvider } from '../providers/awsReadOnly.provider.js';
import { recordAuditEvent } from '../../audit.service.js';

let lastDiscoveryRunAt = null;
const DISCOVERY_COOLDOWN_MS = 15000; // 15 seconds cooldown between discovery sweeps

export const awsDiscoveryService = {
  /**
   * Get AWS Connection Status, Identity and Last Synchronization Details.
   */
  async getConnectionStatus(region = 'ap-south-1', provider = new AwsReadOnlyProvider({ region })) {
    const identity = await provider.getCallerIdentity({ region });

    const lastRunRes = await query(
      `SELECT * FROM cloud_aws_discovery_runs ORDER BY created_at DESC LIMIT 1;`
    );
    const lastRun = lastRunRes.rows[0] || null;

    // Discovered live resources count
    const liveCountRes = await query(
      `SELECT count(*)::int as count FROM cloud_resources WHERE (metadata->>'is_live_aws')::boolean = true;`
    );
    const liveResourcesCount = liveCountRes.rows[0]?.count || 0;

    return {
      connected: identity.connected,
      region,
      identity: identity.connected ? {
        accountIdMasked: identity.accountIdMasked,
        arnMasked: identity.arnMasked,
        userIdMasked: identity.userIdMasked
      } : null,
      error: identity.connected ? null : (identity.errorMessage || identity.error),
      lastSyncAt: lastRun?.created_at || null,
      lastSyncStatus: lastRun?.status || 'never_synced',
      liveResourcesCount,
      freeTierStatus: 'Not verified (Requires billing delegation)',
      pricingAssumptions: 'Estimates are based on AWS published On-Demand rates for ap-south-1. Does not reflect active AWS credits, reserved instances, or savings plans.'
    };
  },

  /**
   * Synchronize actual AWS resources into the inventory database.
   * Strictly read-only; never mutates AWS or overwrites simulated resources.
   *
   * @param {Object} options
   * @param {string} [options.region='ap-south-1']
   * @param {Object} [options.user] - Requesting user
   * @param {AwsReadOnlyProvider} [options.provider] - Injected provider for unit testing
   */
  async syncAwsResources({ region = 'ap-south-1', user, provider = new AwsReadOnlyProvider({ region }) } = {}) {
    const now = Date.now();
    if (lastDiscoveryRunAt && (now - lastDiscoveryRunAt) < DISCOVERY_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((DISCOVERY_COOLDOWN_MS - (now - lastDiscoveryRunAt)) / 1000);
      throw new Error(`AWS Discovery Rate Limit: Please wait ${waitSeconds}s before synchronizing again.`);
    }

    lastDiscoveryRunAt = now;
    const discoveryResult = await provider.discoverAll({ region });
    const runId = `run_${crypto.randomBytes(6).toString('hex')}`;

    if (!discoveryResult.success) {
      // Record failed run
      await query(
        `INSERT INTO cloud_aws_discovery_runs (
           id, region, status, error_message, duration_ms, triggered_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW());`,
        [runId, region, 'unauthorized', discoveryResult.errorMessage || discoveryResult.error, discoveryResult.durationMs, user?.email || 'admin']
      );

      await recordAuditEvent({
        userId: user?.id || null,
        userEmail: user?.email || 'admin',
        action: 'CLOUD_AWS_DISCOVERY_FAILED',
        resourceType: 'aws_discovery',
        resourceId: runId,
        details: { error: discoveryResult.errorMessage || discoveryResult.error, region }
      });

      throw new Error(`AWS Discovery Failed: ${discoveryResult.errorMessage || discoveryResult.error}`);
    }

    // Persist discovered resources into cloud_resources without overwriting simulated resources
    const discovered = discoveryResult.discoveredResources || [];
    let upsertedCount = 0;

    for (const r of discovered) {
      // Upsert into cloud_resources with metadata.is_live_aws = true
      await cloudLifecycleRepository.upsertResource(r);
      upsertedCount++;
    }

    // Record successful discovery run
    await query(
      `INSERT INTO cloud_aws_discovery_runs (
         id, region, status, account_id_masked, caller_arn_masked,
         ec2_count, ebs_count, elastic_ip_count, rds_count, total_resources,
         estimated_monthly_cost, free_tier_status, duration_ms, triggered_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW());`,
      [
        runId,
        region,
        'success',
        discoveryResult.identity?.accountIdMasked || '********',
        discoveryResult.identity?.arnMasked || 'arn:aws:iam::********',
        discoveryResult.counts.ec2,
        discoveryResult.counts.ebs,
        discoveryResult.counts.elasticIps,
        discoveryResult.counts.rds,
        discoveryResult.counts.total,
        discoveryResult.estimatedMonthlyCostUsd,
        'Not verified (Requires billing delegation)',
        discoveryResult.durationMs,
        user?.email || 'admin'
      ]
    );

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'admin',
      action: 'CLOUD_AWS_DISCOVERY_COMPLETED',
      resourceType: 'aws_discovery',
      resourceId: runId,
      details: {
        region,
        accountIdMasked: discoveryResult.identity?.accountIdMasked,
        counts: discoveryResult.counts,
        durationMs: discoveryResult.durationMs
      }
    });

    return {
      runId,
      region,
      identity: discoveryResult.identity,
      counts: discoveryResult.counts,
      upsertedCount,
      estimatedMonthlyCostUsd: discoveryResult.estimatedMonthlyCostUsd,
      freeTierStatus: discoveryResult.freeTierStatus,
      durationMs: discoveryResult.durationMs,
      timestamp: discoveryResult.timestamp
    };
  },

  /**
   * Free Tier Eligibility & Usage Transparency
   * Strictly transparent: Never invents remaining hours or credits.
   */
  getFreeTierGuidelines() {
    return {
      status: 'Not verified',
      verificationDisclosure: 'AWS Free Tier usage and credit balance cannot be verified via read-only infrastructure APIs (EC2/RDS/EBS). An authorized AWS Cost & Billing IAM delegation would be required. InfraPulse will not invent or guess remaining Free Tier allowances.',
      allowancesApSouth1: [
        {
          service: 'Amazon EC2',
          allowance: '750 Hours/Month of t2.micro or t3.micro Linux instances (within 12-month free tier window)',
          notes: 't4g.small promotional free trial applies where eligible in selected regions.'
        },
        {
          service: 'Amazon EBS',
          allowance: '30 GB of General Purpose (gp3/gp2) or Magnetic storage + 2,000,000 I/Os and 1 GB snapshot storage',
          notes: 'Storage exceeding 30 GB total across all volumes incur standard $0.08/GB-mo rates.'
        },
        {
          service: 'Amazon RDS',
          allowance: '750 Hours/Month of db.t4g.micro or db.t3.micro Single-AZ + 20 GB database storage',
          notes: 'Includes automated backups and 20 GB backup storage.'
        },
        {
          service: 'Public IPv4 Addresses',
          allowance: 'Effective Feb 1, 2024, all public IPv4 addresses incur $0.005/hour ($3.65/month each)',
          notes: 'EC2 Free Tier includes 750 hours/month of in-use public IPv4 on eligible micro instances.'
        }
      ],
      costAssumptionsDisclaimer: 'All cost figures shown in InfraPulse are calculated estimates based on ap-south-1 published on-demand rates. Not an official AWS invoice.'
    };
  }
};

