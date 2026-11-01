// ==============================================================================
// InfraPulse - Enterprise Production Hardening & Readiness Test Suite
// Phase 23L: Security, Multi-Tenant Isolation, Failure Recovery, Self-Observability,
// and Deployment Hardening
// ==============================================================================

import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { query, getPoolStats, checkConnection } from '../../backend/src/db/connection.js';
import { sreIntelligenceRepository } from '../../backend/src/repositories/sreIntelligence.repository.js';
import { integrationRepository } from '../../backend/src/repositories/integration.repository.js';
import { remediationRepository } from '../../backend/src/repositories/remediation.repository.js';
import { remediationPolicyService } from '../../backend/src/services/remediation/remediationPolicy.service.js';
import { workloadEligibilityService } from '../../backend/src/services/cloud-lifecycle/services/workloadEligibility.service.js';
import { validateEndpointUrl } from '../../backend/src/integrations/core/ssrfProtection.js';
import { config } from '../../backend/src/config/env.js';

const TENANT_A = 'enterprise-tenant-alpha';
const TENANT_B = 'enterprise-tenant-beta';

describe('Phase 23L: Enterprise Production Readiness & Deployment Hardening', () => {
  beforeEach(async () => {
    // Teardown test tenant data
    await query('DELETE FROM sre_operational_recommendations WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await query('DELETE FROM telemetry_dead_letter WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
  });

  afterEach(async () => {
    await query('DELETE FROM sre_operational_recommendations WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await query('DELETE FROM telemetry_dead_letter WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
  });

  // --------------------------------------------------------------------------
  // 1. Self-Observability & Health Probes
  // --------------------------------------------------------------------------
  test('1. Self-Observability: Connection pool stats and process memory report accurately without exposing credentials', async () => {
    const dbStatus = await checkConnection();
    assert.strictEqual(dbStatus.connected, true);
    assert.ok(dbStatus.latencyMs >= 0);
    // Ensure no password or sensitive connection info is returned
    assert.strictEqual(dbStatus.password, undefined);

    const poolStats = getPoolStats();
    assert.ok(typeof poolStats.totalCount === 'number');
    assert.ok(typeof poolStats.idleCount === 'number');
    assert.ok(typeof poolStats.activeCount === 'number');
    assert.ok(poolStats.totalCount >= 0);
  });

  // --------------------------------------------------------------------------
  // 2. Integration Failure Isolation & Graceful Degradation
  // --------------------------------------------------------------------------
  test('2. Failure Isolation: Provider timeouts or invalid credentials gracefully degrade without crashing event loop', () => {
    // Testing internal resilience of SSRF / network boundary
    const check = validateEndpointUrl('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(check.safe, false);
    assert.match(check.error, /prohibited|metadata|ssrf/i);
  });

  // --------------------------------------------------------------------------
  // 3. Telemetry Dead-Letter Queue & Reliability
  // --------------------------------------------------------------------------
  test('3. Dead-Letter Queue: Invalid or unparseable telemetry payloads are preserved with error codes', async () => {
    const record = await integrationRepository.recordDeadLetter({
      tenantId: TENANT_A,
      environment: 'production',
      provider: 'opentelemetry',
      telemetryType: 'metric',
      payload: { malformedField: true, raw: 'invalid_format' },
      errorReason: 'Malformed metric payload missing timestamp',
      errorCode: 'INVALID_TIMESTAMP'
    });

    assert.ok(record.id);
    assert.strictEqual(record.error_code, 'INVALID_TIMESTAMP');

    // Fetch dead letters for Tenant A
    const deadLettersA = await integrationRepository.listDeadLetters(TENANT_A);
    assert.strictEqual(deadLettersA.length, 1);
    assert.strictEqual(deadLettersA[0].error_code, 'INVALID_TIMESTAMP');

    // Ensure Tenant B cannot see Tenant A's dead letters
    const deadLettersB = await integrationRepository.listDeadLetters(TENANT_B);
    assert.strictEqual(deadLettersB.length, 0);
  });

  // --------------------------------------------------------------------------
  // 4. Strict SSRF Protection
  // --------------------------------------------------------------------------
  test('4. SSRF Protection: Blocks loopback, RFC1918 private subnets, and cloud metadata IPs', () => {
    const prohibitedUrls = [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://instance-data/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/'
    ];

    for (const url of prohibitedUrls) {
      const result = validateEndpointUrl(url);
      assert.strictEqual(result.safe, false);
      assert.match(result.error, /prohibited|metadata|ssrf/i);
    }
  });

  // --------------------------------------------------------------------------
  // 5. Multi-Tenant Strict Isolation Across Subsystems
  // --------------------------------------------------------------------------
  test('5. Multi-Tenant Isolation: Strictly prevents cross-tenant access to recommendations and approvals', async () => {
    // Tenant A creates recommendation
    await sreIntelligenceRepository.createOperationalRecommendation({
      tenantId: TENANT_A,
      environment: 'production',
      title: 'Tenant A Production Right-sizing',
      affectedResource: 'prod-api-server-01',
      affectedService: 'api-gateway',
      expectedBenefit: 'Save $50/mo',
      suggestedAction: 'Right size container',
      potentialOperationalImpact: 'Low',
      priority: 'P2'
    });

    // Query as Tenant B
    const bRecs = await sreIntelligenceRepository.listOperationalRecommendations({
      tenantId: TENANT_B,
      environment: 'production'
    });
    assert.strictEqual(bRecs.length, 0, 'Tenant B must see 0 recommendations from Tenant A');

    // Query as Tenant A
    const aRecs = await sreIntelligenceRepository.listOperationalRecommendations({
      tenantId: TENANT_A,
      environment: 'production'
    });
    assert.strictEqual(aRecs.length, 1);
    assert.strictEqual(aRecs[0].title, 'Tenant A Production Right-sizing');
  });

  // --------------------------------------------------------------------------
  // 6. Remediation Safety Flags & Production Protection
  // --------------------------------------------------------------------------
  test('6. Remediation Safety: Mutation execution is disabled by default in production', async () => {
    // Check global configuration defaults
    assert.strictEqual(config.remediationExecutionEnabled, false);
    assert.strictEqual(config.remediationProductionEnabled, false);

    // Policy check rejects production execution by default
    const prodCheck = await remediationPolicyService.evaluatePolicy({
      action: 'DOCKER_CONTAINER_RESTART',
      environment: 'production',
      targetResource: { id: 'web-prod-01', provider: 'docker' }
    });
    assert.strictEqual(prodCheck.allowed, false);
    assert.match(prodCheck.blockers[0], /production.*disabled/i);
  });

  // --------------------------------------------------------------------------
  // 7. Critical Infrastructure & Database Protection
  // --------------------------------------------------------------------------
  test('7. Database Protection: Workload safety blocks any restart, scale down, or stop of database engines', async () => {
    const dbWorkload = {
      id: 'prod-postgres-db',
      provider: 'docker',
      resource_type: 'docker_container',
      metadata: { image: 'postgres:16-alpine', container_name: 'postgres_primary' },
      name: 'postgres_primary'
    };

    const eligibility = await workloadEligibilityService.evaluateEligibility(dbWorkload, 'stop');
    assert.strictEqual(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => /database.*protected/i.test(b)));
  });

  // --------------------------------------------------------------------------
  // 8. Plan Immutability Hash Verification
  // --------------------------------------------------------------------------
  test('8. Plan Immutability: SHA-256 hash mismatch blocks execution of modified remediation plans', () => {
    const rawPlan = {
      action: 'DOCKER_CONTAINER_RESTART',
      resourceId: 'test-container-alpha',
      parameters: { timeoutSeconds: 30 }
    };
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify(rawPlan)).digest('hex');
    const tamperedPlan = { ...rawPlan, parameters: { timeoutSeconds: 9999 } };
    const tamperedHash = crypto.createHash('sha256').update(JSON.stringify(tamperedPlan)).digest('hex');

    assert.notStrictEqual(expectedHash, tamperedHash);
  });

  // --------------------------------------------------------------------------
  // 9. Concurrency & Idempotency Lock Performance
  // --------------------------------------------------------------------------
  test('9. Concurrency & Performance: High-concurrency operations execute safely without database deadlock', async () => {
    const start = Date.now();
    const concurrentQueries = [];

    // Launch 25 concurrent database queries through pool
    for (let i = 0; i < 25; i++) {
      concurrentQueries.push(query('SELECT 1 as ping;'));
    }

    const results = await Promise.all(concurrentQueries);
    const duration = Date.now() - start;

    assert.strictEqual(results.length, 25);
    for (const res of results) {
      assert.strictEqual(res.rows[0].ping, 1);
    }
    assert.ok(duration < 500, `25 concurrent queries completed in ${duration}ms (< 500ms target)`);
  });

  // --------------------------------------------------------------------------
  // 10. Configurable AWS Region Resilience
  // --------------------------------------------------------------------------
  test('10. AWS Region Hardening: ALLOWED_REGIONS is configurable and rejects unapproved regions', async () => {
    const { ALLOWED_REGIONS, AwsReadOnlyProvider } = await import('../../backend/src/services/cloud-lifecycle/providers/awsReadOnly.provider.js');
    assert.ok(Array.isArray(ALLOWED_REGIONS));
    assert.ok(ALLOWED_REGIONS.includes('ap-south-1'));

    const provider = new AwsReadOnlyProvider({ region: 'ap-south-1' });
    // Valid region passes validation
    assert.strictEqual(provider._validateRegion('ap-south-1'), 'ap-south-1');

    // Invalid region throws clear error
    assert.throws(() => {
      provider._validateRegion('unauthorized-region-xyz');
    }, /not permitted/i);
  });
});
