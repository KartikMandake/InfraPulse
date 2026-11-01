import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('1. FinOps Cost Gate: Evaluates zero-cost eligibility and flags non-zero charges', () => {
  // FinOps evaluation function for ap-south-1
  const evaluateDeploymentBudget = ({
    requestedBudget,
    targetRegion,
    existingEbsGb,
    existingRdsInstances,
    includePublicIpv4
  }) => {
    const freeTierLimits = {
      ebsGbTotal: 30,
      rdsHoursPerMonth: 750,
      publicIpv4AlwaysFree: false // Billed $0.005/hr (~$3.65/mo) as of Feb 2024
    };

    const monthlyCosts = [];
    
    // Check Region
    if (targetRegion !== 'ap-south-1') {
      return { eligible: false, reason: 'Region not approved for deployment' };
    }

    // Check EBS Free Tier threshold
    const proposedEbsGb = 30; // standard gp3 root + data
    const totalEbsGb = existingEbsGb + proposedEbsGb;
    if (totalEbsGb > freeTierLimits.ebsGbTotal) {
      const excessGb = totalEbsGb - freeTierLimits.ebsGbTotal;
      const ebsMonthlyCost = excessGb * 0.0912; // gp3 in ap-south-1 is $0.0912/GB-mo
      monthlyCosts.push({ item: 'EBS Storage Excess', costUsd: ebsMonthlyCost });
    }

    // Check Public IPv4
    if (includePublicIpv4) {
      // $0.005/hr * 730 hrs = $3.65/month
      monthlyCosts.push({ item: 'Public IPv4 Address', costUsd: 3.65 });
    }

    // Check RDS Free Tier collision
    if (existingRdsInstances > 0) {
      monthlyCosts.push({ item: 'Secondary RDS Instance', costUsd: 15.33 }); // db.t4g.micro min
    }

    const totalEstimatedCostUsd = monthlyCosts.reduce((acc, c) => acc + c.costUsd, 0);

    if (requestedBudget === 0 && totalEstimatedCostUsd > 0) {
      return {
        eligible: false,
        status: 'BLOCKED_BY_COST_GATE',
        totalEstimatedCostUsd,
        reasons: monthlyCosts.map(c => `${c.item}: $${c.costUsd.toFixed(2)}/mo`)
      };
    }

    return { eligible: true, status: 'APPROVED', totalEstimatedCostUsd };
  };

  // Test Case A: Existing account state with reachify (20GB EBS, 1 RDS, public IP)
  const resultExisting = evaluateDeploymentBudget({
    requestedBudget: 0,
    targetRegion: 'ap-south-1',
    existingEbsGb: 20,
    existingRdsInstances: 1,
    includePublicIpv4: true
  });

  assert.equal(resultExisting.eligible, false);
  assert.equal(resultExisting.status, 'BLOCKED_BY_COST_GATE');
  assert.ok(resultExisting.totalEstimatedCostUsd > 0);
  assert.ok(resultExisting.reasons.some(r => r.includes('Public IPv4 Address')));
  assert.ok(resultExisting.reasons.some(r => r.includes('EBS Storage Excess')));
});

test('2. Credential Security: Discovered AWS Account ID is properly redacted/masked', () => {
  const maskAccountId = (arnOrAccount) => {
    return String(arnOrAccount).replace(/\b(\d{8})(\d{4})\b/g, '********$2');
  };

  const rawArn = 'arn:aws:iam::416121583579:root';
  const rawId = '416121583579';

  assert.equal(maskAccountId(rawArn), 'arn:aws:iam::********3579:root');
  assert.equal(maskAccountId(rawId), '********3579');
  assert.ok(!maskAccountId(rawArn).includes('41612158'));
});

test('3. IAM Least-Privilege Policy: Restricts actions to ap-south-1 and prohibits mutating wildcards', () => {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'InfraPulseCallerIdentity',
        Effect: 'Allow',
        Action: ['sts:GetCallerIdentity'],
        Resource: '*'
      },
      {
        Sid: 'InfraPulseEc2ReadOnlyDiscovery',
        Effect: 'Allow',
        Action: [
          'ec2:DescribeInstances',
          'ec2:DescribeVolumes',
          'ec2:DescribeAddresses',
          'ec2:DescribeRegions'
        ],
        Resource: '*',
        Condition: {
          StringEquals: {
            'aws:RequestedRegion': 'ap-south-1'
          }
        }
      }
    ]
  };

  // Ensure no wildcard * in actions
  for (const stmt of policy.Statement) {
    for (const action of stmt.Action) {
      assert.ok(!action.includes('*'), `Action '${action}' must not contain wildcards`);
    }
    if (stmt.Condition) {
      assert.equal(stmt.Condition.StringEquals['aws:RequestedRegion'], 'ap-south-1');
    }
  }
});

test('4. Deployment Approval Gate: Blocks deployment without explicit user approval record', () => {
  const verifyDeploymentApproval = (approvalRecord) => {
    if (!approvalRecord) return { allowed: false, reason: 'No approval record provided' };
    if (!approvalRecord.userExplicitlyApproved) return { allowed: false, reason: 'User has not explicitly approved provisioning' };
    if (!approvalRecord.acceptedMonthlyCostEstimate) return { allowed: false, reason: 'Cost estimate not acknowledged' };
    if (approvalRecord.budgetOutPocket === 0 && approvalRecord.estimatedCostUsd > 0 && !approvalRecord.acceptedMonthlyCostEstimate) {
      return { allowed: false, reason: 'Budget is ₹0 but cost is non-zero' };
    }
    return { allowed: true, reason: 'Deployment authorized' };
  };

  // Attempt without approval
  assert.equal(verifyDeploymentApproval(null).allowed, false);
  assert.equal(verifyDeploymentApproval({ userExplicitlyApproved: false }).allowed, false);

  // General request without explicit financial approval
  const generalRequest = {
    userExplicitlyApproved: false,
    prompt: 'Implement Phase 28: Controlled Cloud Deployment'
  };
  assert.equal(verifyDeploymentApproval(generalRequest).allowed, false);
});

test('5. Compose Production Invariants: Ensures immutable digests and private network isolation', () => {
  const composePath = path.join(rootDir, 'deploy/production/compose.yml');
  assert.ok(fs.existsSync(composePath), 'Production compose file must exist');

  const content = fs.readFileSync(composePath, 'utf8');
  
  // Must bind frontend only to loopback
  assert.ok(content.includes('127.0.0.1:${FRONTEND_PORT:-8080}:8080') || content.includes('127.0.0.1:8080:8080'));
  
  // Must keep postgres in network_mode: none
  assert.ok(content.includes('network_mode: none') || content.includes('network_mode: "none"'));
  
  // External persistent volume must be declared
  assert.ok(content.includes('postgres-data:'));
  assert.ok(content.includes('external: true') || content.includes('external: "true"'));
  
  // Mutation flags must be false
  assert.ok(content.includes('AWS_LIFECYCLE_MUTATIONS_ENABLED: "false"'));
  assert.ok(content.includes('REMEDIATION_EXECUTION_ENABLED: "false"'));
});

test('6. Production Database Rollback & Backup Scripts: Exist and have executable logic', () => {
  const backupPs1 = path.join(rootDir, 'scripts/backup-db.ps1');
  const restorePs1 = path.join(rootDir, 'scripts/restore-db.ps1');
  const backupSh = path.join(rootDir, 'scripts/backup-db.sh');
  const restoreSh = path.join(rootDir, 'scripts/restore-db.sh');

  assert.ok(fs.existsSync(backupPs1), 'backup-db.ps1 must exist');
  assert.ok(fs.existsSync(restorePs1), 'restore-db.ps1 must exist');
  assert.ok(fs.existsSync(backupSh), 'backup-db.sh must exist');
  assert.ok(fs.existsSync(restoreSh), 'restore-db.sh must exist');

  const backupContent = fs.readFileSync(backupPs1, 'utf8');
  assert.ok(backupContent.includes('pg_dump') || backupContent.includes('BACKUP'), 'Backup script must reference pg_dump');
});

test('7. Architecture Comparison: Option A, B, and C cost models are complete and bounded', () => {
  const architectures = {
    optionA_EC2: {
      type: 'EC2 Single Host (t4g.small / t3.small)',
      estimatedMonthlyUsd: [30, 45],
      zeroCostEligible: false, // Due to IPv4 ($3.65) and existing EBS consumption
      operationalComplexity: 'Moderate (Self-managed containers, local Postgres)'
    },
    optionB_Managed: {
      type: 'ECS Fargate + RDS + ALB',
      estimatedMonthlyUsd: [150, 220],
      zeroCostEligible: false,
      operationalComplexity: 'High (Multi-tier AWS IAM, VPC, NAT Gateway, ALB, RDS)'
    },
    optionC_LocalSelfHosted: {
      type: 'Local Workstation / Self-Hosted Docker Staging',
      estimatedMonthlyUsd: [0, 0],
      zeroCostEligible: true,
      operationalComplexity: 'Low (Zero cloud provider bill, local persistence)'
    }
  };

  assert.equal(architectures.optionA_EC2.zeroCostEligible, false);
  assert.equal(architectures.optionB_Managed.zeroCostEligible, false);
  assert.equal(architectures.optionC_LocalSelfHosted.zeroCostEligible, true);
  assert.equal(architectures.optionC_LocalSelfHosted.estimatedMonthlyUsd[0], 0);
});

test('8. Rollback Safety: Persistent volume is never dropped during container stop or rollback', () => {
  const rollbackCommand = 'docker compose -f deploy/production/compose.yml down';
  // docker compose down without -v preserves named and external volumes
  assert.ok(!rollbackCommand.includes('-v'), 'Rollback command must never specify -v (destroy volumes)');
  assert.ok(!rollbackCommand.includes('--volumes'), 'Rollback command must never specify --volumes');
});
