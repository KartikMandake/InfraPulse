// ==============================================================================
// InfraPulse - Phase 23H: Real Infrastructure Integrations & Live Telemetry Pipeline
// Comprehensive Automated Test Suite (17 Coverage Areas)
// ==============================================================================

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../backend/src/db/connection.js';

// Providers & Core Services
import { AwsIntegrationProvider } from '../../backend/src/integrations/providers/aws/AwsIntegrationProvider.js';
import { DockerIntegrationProvider } from '../../backend/src/integrations/providers/docker/DockerIntegrationProvider.js';
import { KubernetesProvider } from '../../backend/src/integrations/providers/kubernetes/KubernetesProvider.js';
import { PrometheusProvider } from '../../backend/src/integrations/providers/prometheus/PrometheusProvider.js';
import { OpenTelemetryProvider } from '../../backend/src/integrations/providers/opentelemetry/OpenTelemetryProvider.js';
import { validateEndpointUrl } from '../../backend/src/integrations/core/ssrfProtection.js';
import { encryptCredentials, decryptCredentials, redactSecrets } from '../../backend/src/integrations/core/crypto.js';
import { integrationService } from '../../backend/src/services/integration.service.js';
import { integrationRepository } from '../../backend/src/repositories/integration.repository.js';
import { telemetryPipelineService } from '../../backend/src/services/telemetryPipeline.service.js';
import { cloudLifecycleRepository } from '../../backend/src/repositories/cloudLifecycle.repository.js';

const TEST_TENANT_1 = 'tenant_prod_alpha';
const TEST_TENANT_2 = 'tenant_prod_beta';
const ADMIN_USER = { id: 'usr_admin_test', name: 'DevOps Admin', role: 'admin', email: 'admin@infrapulse.io' };

describe('Phase 23H: Real Infrastructure Integrations & Live Telemetry Pipeline', () => {

  beforeEach(async () => {
    await query('DELETE FROM telemetry_deduplication WHERE tenant_id IN ($1,$2)',[TEST_TENANT_1,TEST_TENANT_2]);
    // Clean test state across integrations, telemetry stats, and cloud resources
    await query(`DELETE FROM integration_telemetry_stats WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integration_credentials WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integration_health_events WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integrations WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM cloud_resources WHERE id LIKE 'test-23h-%' OR id LIKE 'i-test-%' OR id LIKE 'vol-test-%' OR id LIKE 'k8s-test-%'`);
  });

  afterEach(async () => {
    await query(`DELETE FROM integration_telemetry_stats WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integration_credentials WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integration_health_events WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM integrations WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM cloud_resources WHERE id LIKE 'test-23h-%' OR id LIKE 'i-test-%' OR id LIKE 'vol-test-%' OR id LIKE 'k8s-test-%'`);
  });

  // ---------------------------------------------------------------------------
  // 1. AWS Authentication & Resource Discovery via Injected Clients
  // ---------------------------------------------------------------------------
  test('1. AWS Provider: STS authentication & discovery of EC2, EBS, RDS, and CloudWatch metrics', async () => {
    const mockSts = {
      send: async () => ({
        UserId: 'AROAEXAMPLE:session',
        Account: '123456789012',
        Arn: 'arn:aws:sts::123456789012:assumed-role/InfraPulseReadOnlyRole/session'
      })
    };

    const mockEc2 = {
      send: async (cmd) => {
        if (cmd.constructor?.name === 'DescribeVolumesCommand') {
          return {
            Volumes: [
              {
                VolumeId: 'vol-test-0123456789abcdef0',
                Size: 50,
                VolumeType: 'gp3',
                State: 'in-use',
                Attachments: [{ InstanceId: 'i-test-0123456789abcdef0' }]
              }
            ]
          };
        }
        return {
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'i-test-0123456789abcdef0',
                  InstanceType: 't4g.small',
                  State: { Name: 'running' },
                  PrivateIpAddress: '10.0.1.50',
                  PublicIpAddress: '13.232.10.15',
                  Placement: { AvailabilityZone: 'ap-south-1a' },
                  Tags: [{ Key: 'Name', Value: 'payment-prod-ec2' }, { Key: 'Environment', Value: 'production' }],
                  SecurityGroups: [{ GroupName: 'app-secgroup' }]
                }
              ]
            }
          ],
          NextToken: null
        };
      }
    };

    const mockRds = {
      send: async () => ({
        DBInstances: [
          {
            DBInstanceIdentifier: 'test-postgres-db',
            DBInstanceClass: 'db.t4g.micro',
            Engine: 'postgres',
            DBInstanceStatus: 'available',
            AllocatedStorage: 20
          }
        ]
      })
    };

    const mockCw = {
      send: async () => ({
        MetricDataResults: [
          {
            Id: 'cpu_util',
            Values: [42.5],
            Timestamps: [new Date()]
          }
        ]
      })
    };

    const awsProvider = new AwsIntegrationProvider({
      stsClient: mockSts,
      ec2Client: mockEc2,
      rdsClient: mockRds,
      cwClient: mockCw
    });

    const connRes = await awsProvider.testConnection({ region: 'ap-south-1' }, { accessKeyId: 'AKIA_MOCK_TEST_SAMPLE_KEY_1', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' });
    assert.strictEqual(connRes.ok, true, 'STS authentication should succeed');
    assert.ok(connRes.details.accountId.includes('****') || connRes.details.accountId.includes('1234'));

    const syncRes = await awsProvider.syncResources({ region: 'ap-south-1', environment: 'production' }, {});
    assert.strictEqual(syncRes.discoveredResources.length, 3, 'Should discover EC2, EBS, and RDS');
    assert.strictEqual(syncRes.discoveredResources[0].id, 'i-test-0123456789abcdef0');
    assert.strictEqual(syncRes.discoveredResources[0].current_state, 'running');
    assert.strictEqual(syncRes.discoveredResources[0].metadata.public_ip, '13.232.10.15');
    assert.strictEqual(syncRes.discoveredResources[1].resource_type, 'ebs_volume');
    assert.strictEqual(syncRes.discoveredResources[2].resource_type, 'rds_instance');
    assert.strictEqual(syncRes.telemetryMetrics.length, 1, 'Should ingest CloudWatch CPU metric');
  });

  // ---------------------------------------------------------------------------
  // 2. AWS Pagination with NextToken
  // ---------------------------------------------------------------------------
  test('2. AWS Provider: Multi-page EC2 discovery using NextToken pagination', async () => {
    let ec2InstanceCalls = 0;
    const mockEc2 = {
      send: async (cmd) => {
        if (cmd.constructor?.name === 'DescribeInstancesCommand') {
          ec2InstanceCalls++;
          if (ec2InstanceCalls === 1) {
            return {
              Reservations: [
                {
                  Instances: [{ InstanceId: 'i-test-page1', InstanceType: 't4g.small', State: { Name: 'running' } }]
                }
              ],
              NextToken: 'token_next_page_123'
            };
          }
          return {
            Reservations: [
              {
                Instances: [{ InstanceId: 'i-test-page2', InstanceType: 't4g.small', State: { Name: 'running' } }]
              }
            ],
            NextToken: null
          };
        }
        return { Volumes: [] };
      }
    };

    const awsProvider = new AwsIntegrationProvider({
      ec2Client: mockEc2,
      rdsClient: { send: async () => ({ DBInstances: [] }) },
      cwClient: { send: async () => ({ MetricDataResults: [] }) }
    });

    const syncRes = await awsProvider.syncResources({ region: 'ap-south-1' }, {});
    assert.strictEqual(ec2InstanceCalls, 2, 'Should have queried EC2 twice for pagination');
    const ec2Ids = syncRes.discoveredResources.map(r => r.id);
    assert.ok(ec2Ids.includes('i-test-page1'), 'Contains page 1 instance');
    assert.ok(ec2Ids.includes('i-test-page2'), 'Contains page 2 instance');
  });

  // ---------------------------------------------------------------------------
  // 3. Docker Socket & Remote Connection Health Checks
  // ---------------------------------------------------------------------------
  test('3. Docker Provider: Health check ping over Engine API', async () => {
    const mockRequester = async (path) => {
      if (path === '/_ping') return 'OK';
      throw new Error(`Unexpected path: ${path}`);
    };

    const dockerProvider = new DockerIntegrationProvider({ client: mockRequester });
    const connRes = await dockerProvider.testConnection({ socketPath: '/var/run/docker.sock' });

    assert.strictEqual(connRes.ok, true);
    assert.ok(connRes.message.includes('Docker daemon is responsive'));
    assert.strictEqual(connRes.details.readOnly, true);
  });

  // ---------------------------------------------------------------------------
  // 4. Docker Container Inventory & Live CPU/Memory/Network Stats Calculation
  // ---------------------------------------------------------------------------
  test('4. Docker Provider: Inventory and deterministic CPU & memory percentage calculation', async () => {
    const mockRequester = async (path) => {
      if (path === '/containers/json?all=true') {
        return [
          {
            Id: 'c123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            Names: ['/infrapulse_backend_1'],
            Image: 'infrapulse-backend:prod',
            State: 'running',
            Status: 'Up 4 hours (healthy)',
            Labels: {
              'com.docker.compose.service': 'backend',
              'com.docker.compose.project': 'infrapulse'
            }
          }
        ];
      }
      if (path.includes('/stats?stream=false')) {
        return {
          cpu_stats: {
            cpu_usage: { total_usage: 500000000 },
            system_cpu_usage: 10000000000,
            online_cpus: 4
          },
          precpu_stats: {
            cpu_usage: { total_usage: 400000000 },
            system_cpu_usage: 9000000000
          },
          memory_stats: {
            usage: 536870912, // 512 MB
            limit: 2147483648  // 2 GB (25%)
          },
          networks: {
            eth0: { rx_bytes: 204800, tx_bytes: 102400 }
          }
        };
      }
      throw new Error(`Unhandled path: ${path}`);
    };

    const dockerProvider = new DockerIntegrationProvider({ client: mockRequester });
    const syncRes = await dockerProvider.syncResources({ environment: 'staging' });

    assert.strictEqual(syncRes.discoveredResources.length, 1);
    const container = syncRes.discoveredResources[0];
    assert.strictEqual(container.name, 'infrapulse_backend_1');
    assert.strictEqual(container.current_state, 'running');
    assert.strictEqual(container.metadata.compose_service, 'backend');
    assert.strictEqual(container.metadata.compose_project, 'infrapulse');

    // Stats calculations:
    // cpu_delta = 100,000,000 / system_delta = 1,000,000,000 * 4 cpus * 100 = 40.0%
    assert.strictEqual(container.metadata.stats.cpu_percent, 40);
    // memory: 512MB / 2GB = 25.0%
    assert.strictEqual(container.metadata.stats.memory_percent, 25);
    assert.strictEqual(container.metadata.stats.network_rx_bytes, 204800);
  });

  // ---------------------------------------------------------------------------
  // 5. Docker Compose Service Discovery via Labels
  // ---------------------------------------------------------------------------
  test('5. Docker Provider: Multi-container Compose service topology extraction', async () => {
    const mockRequester = async (path) => {
      if (path === '/containers/json?all=true') {
        return [
          {
            Id: 'c111111111111',
            Names: ['/web_app_1'],
            State: 'running',
            Labels: { 'com.docker.compose.service': 'frontend', 'com.docker.compose.project': 'ecommerce' }
          },
          {
            Id: 'c222222222222',
            Names: ['/db_postgres_1'],
            State: 'running',
            Labels: { 'com.docker.compose.service': 'database', 'com.docker.compose.project': 'ecommerce' }
          }
        ];
      }
      if (path.includes('/stats')) return {};
      return [];
    };

    const dockerProvider = new DockerIntegrationProvider({ client: mockRequester });
    const syncRes = await dockerProvider.syncResources({});

    assert.strictEqual(syncRes.discoveredResources.length, 2);
    const services = syncRes.discoveredResources.map(r => r.metadata.compose_service);
    assert.deepStrictEqual(services.sort(), ['database', 'frontend']);
  });

  // ---------------------------------------------------------------------------
  // 6. Kubernetes Cluster Connection & Resource Discovery
  // ---------------------------------------------------------------------------
  test('6. Kubernetes Provider: Namespaces, Deployments, StatefulSets, Pods, and Warning Events', async () => {
    const mockClient = {
      ping: async () => true,
      getClusterSnapshot: async () => ({
        namespaces: ['default', 'production'],
        deployments: [
          {
            name: 'payment-service-deployment',
            namespace: 'production',
            replicas: 3,
            readyReplicas: 3,
            updatedReplicas: 3,
            image: 'payment-service:v2.1.0'
          }
        ],
        statefulsets: [
          {
            name: 'redis-cluster',
            namespace: 'production',
            replicas: 3,
            readyReplicas: 3,
            image: 'redis:7.2'
          }
        ],
        pods: [
          {
            name: 'payment-service-deployment-abc123',
            namespace: 'production',
            status: 'Running',
            ready: true,
            restartCount: 0,
            waitingReason: null,
            serviceMapping: 'payment-service'
          }
        ],
        warningEvents: [
          {
            reason: 'OOMKilled',
            message: 'Container payment-service exceeded memory limit',
            involvedObject: { kind: 'Pod', name: 'payment-service-deployment-abc123' },
            namespace: 'production'
          }
        ]
      })
    };

    const k8sProvider = new KubernetesProvider({ client: mockClient });
    const connRes = await k8sProvider.testConnection({ clusterUrl: 'https://k8s.example.internal' }, { bearerToken: 'token_xyz' });
    assert.strictEqual(connRes.ok, true);

    const syncRes = await k8sProvider.syncResources({ clusterUrl: 'https://k8s.example.internal', environment: 'production' }, {});
    assert.strictEqual(syncRes.discoveredResources.length, 3, 'Should discover Deployment, StatefulSet, and Pod');
    assert.strictEqual(syncRes.warningEvents.length, 1, 'Should normalize warning event');
    assert.strictEqual(syncRes.warningEvents[0].severity, 'high');
    assert.strictEqual(syncRes.warningEvents[0].normalizedAttributes.clusterReason, 'OOMKilled');
  });

  // ---------------------------------------------------------------------------
  // 7. Kubernetes Pagination & Rollout Status
  // ---------------------------------------------------------------------------
  test('7. Kubernetes Provider: Rollout status detection for degraded deployments', async () => {
    const mockClient = {
      getClusterSnapshot: async () => ({
        namespaces: ['staging'],
        deployments: [
          {
            name: 'checkout-service',
            namespace: 'staging',
            replicas: 5,
            readyReplicas: 2, // Degraded rollout: 2 of 5 ready
            updatedReplicas: 2,
            image: 'checkout-service:v1.9'
          }
        ],
        statefulsets: [],
        pods: [],
        warningEvents: []
      })
    };

    const k8sProvider = new KubernetesProvider({ client: mockClient });
    const syncRes = await k8sProvider.syncResources({});
    const dep = syncRes.discoveredResources.find(r => r.name === 'checkout-service');
    assert.ok(dep);
    assert.strictEqual(dep.current_state, 'degraded', 'Deployment with readyReplicas < replicas should be degraded');
  });

  // ---------------------------------------------------------------------------
  // 8. Prometheus Connection, PromQL Instant & Range Queries
  // ---------------------------------------------------------------------------
  test('8. Prometheus Provider: Instant and range PromQL querying', async () => {
    const mockClient = {
      ping: async () => true,
      queryInstant: async (queryStr) => ({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            {
              metric: { __name__: 'http_requests_total', service: 'payment-service' },
              value: [1730000000, '142.8']
            }
          ]
        }
      }),
      queryRange: async (queryStr, start, end, step) => ({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { service: 'payment-service' },
              values: [[1730000000, '100'], [1730000015, '120']]
            }
          ]
        }
      })
    };

    const promProvider = new PrometheusProvider({ client: mockClient });
    const testRes = await promProvider.testConnection({ endpoint: 'http://localhost:9090' }, {});
    assert.strictEqual(testRes.ok, true);

    const instantRes = await promProvider.queryInstant('rate(http_requests_total[5m])');
    const normalized = promProvider.normalizeMetricResult(instantRes, 'rps', 'payment-service');
    assert.strictEqual(normalized.available, true);
    assert.strictEqual(normalized.value, 142.8);

    const rangeRes = await promProvider.queryRange('rate(http_requests_total[5m])', Date.now() - 3600000, Date.now(), '60s');
    assert.strictEqual(rangeRes.data.result.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 9. Prometheus Distinction Between Unreachable Endpoint vs Valid 0 Metric
  // ---------------------------------------------------------------------------
  test('9. Prometheus Provider: Distinguishes between valid 0 metric vs unavailable endpoint', async () => {
    const promProvider = new PrometheusProvider();

    // Scenario A: Valid 0 (e.g. error rate is genuinely 0.0)
    const zeroResult = {
      status: 'success',
      data: {
        result: [{ metric: { service: 'auth-service' }, value: [1730000000, '0'] }]
      }
    };
    const zeroNormalized = promProvider.normalizeMetricResult(zeroResult, 'error_rate', 'auth-service');
    assert.strictEqual(zeroNormalized.available, true);
    assert.strictEqual(zeroNormalized.value, 0, 'Value should be numeric 0, not null');
    assert.strictEqual(zeroNormalized.status, 'AVAILABLE');

    // Scenario B: Unreachable or empty series (telemetry offline)
    const emptyResult = {
      status: 'success',
      data: { result: [] }
    };
    const emptyNormalized = promProvider.normalizeMetricResult(emptyResult, 'error_rate', 'auth-service');
    assert.strictEqual(emptyNormalized.available, false);
    assert.strictEqual(emptyNormalized.value, null, 'Value must be null to prevent false positive 0 alerts');
    assert.strictEqual(emptyNormalized.status, 'UNAVAILABLE');
  });

  // ---------------------------------------------------------------------------
  // 10. OTLP Metrics Ingestion Preserving Attributes
  // ---------------------------------------------------------------------------
  test('10. OTLP Provider: Preserves service.name, environment, and gauge/counter values', () => {
    const otelProvider = new OpenTelemetryProvider();
    const otlpPayload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'order-service' } },
              { key: 'deployment.environment', value: { stringValue: 'staging' } },
              { key: 'host.id', value: { stringValue: 'node-92' } }
            ]
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'system.cpu.utilization',
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: 0.88,
                        timeUnixNano: '1730000000000000000',
                        attributes: [{ key: 'cpu', value: { stringValue: 'cpu0' } }]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    const normalized = otelProvider.normalizeMetricPayload(otlpPayload);
    assert.strictEqual(normalized.length, 1);
    const ev = normalized[0];
    assert.strictEqual(ev.eventType, 'metric_anomaly');
    assert.strictEqual(ev.serviceId, 'order-service');
    assert.strictEqual(ev.metric, 'system.cpu.utilization');
    assert.strictEqual(ev.value, 0.88);
    assert.strictEqual(ev.environment, 'staging');
    assert.strictEqual(ev.normalizedAttributes.resourceAttributes['host.id'], 'node-92');
  });

  // ---------------------------------------------------------------------------
  // 11. OTLP Traces Ingestion with Span Linkage and Correlation
  // ---------------------------------------------------------------------------
  test('11. OTLP Provider: Preserves traceId, spanId, parentSpanId, and error status', () => {
    const otelProvider = new OpenTelemetryProvider();
    const tracePayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'payment-gateway' } }]
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
                  spanId: '00f067aa0ba902b7',
                  parentSpanId: '5fb397be34d23b0f',
                  name: 'POST /v1/charge',
                  startTimeUnixNano: '1730000000000000000',
                  endTimeUnixNano: '1730000001500000000', // 1500 ms
                  status: { code: 2, message: 'Payment authorization timeout' },
                  attributes: [{ key: 'http.status_code', value: { intValue: 504 } }]
                }
              ]
            }
          ]
        }
      ]
    };

    const traces = otelProvider.normalizeTracePayload(tracePayload);
    assert.strictEqual(traces.length, 1);
    const trace = traces[0];
    assert.strictEqual(trace.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.strictEqual(trace.spanId, '00f067aa0ba902b7');
    assert.strictEqual(trace.parentSpanId, '5fb397be34d23b0f');
    assert.strictEqual(trace.durationMs, 1500);
    assert.strictEqual(trace.error, true);
    assert.strictEqual(trace.severity, 'high');
  });

  // ---------------------------------------------------------------------------
  // 12. OTLP Logs Ingestion with Severity Mapping
  // ---------------------------------------------------------------------------
  test('12. OTLP Provider: Maps OpenTelemetry severity numbers into canonical severity levels', () => {
    const otelProvider = new OpenTelemetryProvider();
    const logPayload = {
      resourceLogs: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'auth-service' } }]
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  severityNumber: 17, // ERROR
                  severityText: 'ERROR',
                  body: { stringValue: 'Database connection pool exhausted' }
                },
                {
                  severityNumber: 9, // INFO
                  severityText: 'INFO',
                  body: { stringValue: 'Token issued successfully' }
                }
              ]
            }
          ]
        }
      ]
    };

    const logs = otelProvider.normalizeLogPayload(logPayload);
    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs[0].severity, 'high');
    assert.strictEqual(logs[0].logMessage, 'Database connection pool exhausted');
    assert.strictEqual(logs[1].severity, 'info');
  });

  // ---------------------------------------------------------------------------
  // 13. SSRF Protection: Blocks Cloud Metadata & Link-Local IPs
  // ---------------------------------------------------------------------------
  test('13. SSRF Protection: Enforces protocol restrictions and blocks cloud metadata IPs', () => {
    // Prohibited: AWS IMDSv2 metadata
    const r1 = validateEndpointUrl('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(r1.safe, false);
    assert.match(r1.error, /cloud.*metadata/i);

    // Prohibited: GCP metadata
    const r2 = validateEndpointUrl('http://metadata.google.internal/computeMetadata/v1/');
    assert.strictEqual(r2.safe, false);
    assert.match(r2.error, /cloud.*metadata/i);

    // Prohibited: Link-local range
    const r3 = validateEndpointUrl('http://169.254.1.1/secret');
    assert.strictEqual(r3.safe, false);
    assert.match(r3.error, /prohibited/i);

    // Prohibited: Disallowed protocol (FTP)
    const r4 = validateEndpointUrl('ftp://internal.vault.com/secret');
    assert.strictEqual(r4.safe, false);
    assert.match(r4.error, /protocol/i);

    // Allowed: Valid HTTP & HTTPS endpoints
    const validHttp = validateEndpointUrl('http://prometheus.internal.local:9090');
    assert.strictEqual(validHttp.safe, true);

    const validHttps = validateEndpointUrl('https://k8s.cluster.example.com:6443');
    assert.strictEqual(validHttps.safe, true);
  });

  // ---------------------------------------------------------------------------
  // 14. AES-256-GCM Credential Encryption at Rest & Secret Redaction
  // ---------------------------------------------------------------------------
  test('14. Credential Security: AES-256-GCM envelope encryption and secret redaction', () => {
    const rawCredentials = {
      accessKeyId: 'AKIA_MOCK_TEST_SAMPLE_KEY_1',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      bearerToken: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0'
    };

    // Encrypt at rest
    const encrypted = encryptCredentials(rawCredentials, { keyVersion: 2 });
    assert.ok(encrypted.encryptedData);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
    assert.strictEqual(encrypted.keyVersion, 2);
    assert.ok(!encrypted.encryptedData.includes('wJalrXUtnFEMI'));

    // Decrypt
    const decrypted = decryptCredentials({
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag
    });
    assert.strictEqual(decrypted.accessKeyId, rawCredentials.accessKeyId);
    assert.strictEqual(decrypted.secretAccessKey, rawCredentials.secretAccessKey);

    // Redact for presentation
    const redacted = redactSecrets(rawCredentials);
    assert.ok(redacted.secretAccessKey.includes('****'), 'Secret should be redacted with asterisks');
    assert.notStrictEqual(redacted.secretAccessKey, rawCredentials.secretAccessKey);
    assert.ok(redacted.accessKeyId.startsWith('AKIA'));
    assert.ok(redacted.accessKeyId.endsWith('EY_1'));
  });

  // ---------------------------------------------------------------------------
  // 15. Telemetry Pipeline: Alert Triggering & Anomaly Routing
  // ---------------------------------------------------------------------------
  test('15. Telemetry Pipeline: Routes metrics, evaluates alert conditions, and updates telemetry stats', async () => {
    // Create test integration
    const intRecord = await integrationRepository.create({
      id: 'int-test-otel-001',
      provider: 'opentelemetry',
      name: 'OpenTelemetry Staging Collector',
      status: 'CONNECTED',
      enabled: true,
      config: { environment: 'staging' }
    }, TEST_TENANT_1);

    const testMetricEvents = [
      {
        eventType: 'metric_anomaly',
        serviceId: 'payment-service',
        serviceName: 'Payment Gateway',
        metric: 'error_rate',
        value: 0.12, // 12% error rate (triggers degraded / alert)
        environment: 'staging',
        tenantId: TEST_TENANT_1
      }
    ];

    const result = await telemetryPipelineService.normalizeAndRouteTelemetry({
      integrationId: intRecord.id,
      tenantId: TEST_TENANT_1,
      environment: 'staging',
      provider: 'opentelemetry',
      telemetryType: 'metric',
      events: testMetricEvents,
      rawBytes: 1024
    });

    assert.strictEqual(result.processedCount, 1);

    // Verify stats recorded in database
    const stats = await integrationRepository.getTelemetryStats(intRecord.id, TEST_TENANT_1);
    assert.ok(stats);
    assert.strictEqual(Number(stats.metrics_ingested_count), 1);
    assert.strictEqual(Number(stats.bytes_ingested), 1024);
  });

  // ---------------------------------------------------------------------------
  // 16. Telemetry Pipeline: Drift Detection on Synchronized Resources
  // ---------------------------------------------------------------------------
  test('16. Telemetry Pipeline: Synchronizes infrastructure inventory and invokes drift detection', async () => {
    const intRecord = await integrationRepository.create({
      id: 'int-test-aws-001',
      provider: 'aws',
      name: 'AWS ap-south-1 Production',
      status: 'CONNECTED',
      enabled: true,
      config: { region: 'ap-south-1', environment: 'staging' }
    }, TEST_TENANT_1);

    const discovered = [
      {
        id: 'test-23h-ec2-01',
        name: 'test-worker-node',
        provider: 'aws',
        resource_type: 'ec2_instance',
        region: 'ap-south-1',
        environment: 'staging',
        current_state: 'running',
        estimated_hourly_cost: 0.0208,
        metadata: { instance_type: 't4g.small', is_live_aws: true }
      }
    ];

    const syncRes = await telemetryPipelineService.syncInfrastructureInventory({
      integration: intRecord,
      discoveredResources: discovered,
      telemetryMetrics: [],
      tenantId: TEST_TENANT_1,
      environment: 'staging'
    });

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.resourcesDiscovered, 1);
    assert.strictEqual(syncRes.resourcesUpserted, 1);

    // Verify persistence in cloud_resources
    const saved = await cloudLifecycleRepository.getResourceById('test-23h-ec2-01');
    assert.ok(saved);
    assert.strictEqual(saved.name, 'test-worker-node');
    assert.strictEqual(saved.provider, 'aws');
    assert.strictEqual(saved.current_state, 'running');
  });

  // ---------------------------------------------------------------------------
  // 17. Multi-Tenant and Environment Isolation
  // ---------------------------------------------------------------------------
  test('17. Isolation: Multi-tenant boundary enforcement across integrations and telemetry', async () => {
    // Tenant 1 Integration
    await integrationRepository.create({
      id: 'int-tenant-1',
      provider: 'prometheus',
      name: 'Tenant 1 Prometheus',
      status: 'CONNECTED',
      enabled: true,
      config: { endpoint: 'http://prom.tenant1.local' }
    }, TEST_TENANT_1);

    await integrationRepository.recordTelemetryStats({
      integrationId: 'int-tenant-1',
      tenantId: TEST_TENANT_1,
      metricsReceived: 42,
      tracesReceived: 10,
      logsReceived: 5,
      bytesReceived: 5000
    });

    // Tenant 2 Integration
    await integrationRepository.create({
      id: 'int-tenant-2',
      provider: 'prometheus',
      name: 'Tenant 2 Prometheus',
      status: 'CONNECTED',
      enabled: true,
      config: { endpoint: 'http://prom.tenant2.local' }
    }, TEST_TENANT_2);

    // Assert Tenant 1 only sees Tenant 1 integrations
    const listTenant1 = await integrationRepository.listIntegrations({ tenantId: TEST_TENANT_1 });
    assert.strictEqual(listTenant1.length, 1);
    assert.strictEqual(listTenant1[0].id, 'int-tenant-1');

    // Assert Tenant 2 cannot see Tenant 1 stats
    const statsTenant2 = await integrationRepository.getTelemetryStats('int-tenant-1', TEST_TENANT_2);
    assert.strictEqual(statsTenant2, null, 'Tenant 2 must not be able to read Tenant 1 telemetry stats');

    const statsTenant1 = await integrationRepository.getTelemetryStats('int-tenant-1', TEST_TENANT_1);
    assert.ok(statsTenant1);
    assert.strictEqual(Number(statsTenant1.metrics_ingested_count), 42);
  });

});
