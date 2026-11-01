import dotenv from 'dotenv';
import {readSetting,validateProductionConfig} from './settings.js';
dotenv.config();

const productionLike = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';

export const config = {
  port: Number(process.env.PORT || '5000'),
  bindHost:process.env.BIND_HOST||'0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  productionLike,
  shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || '25000'),
  workerHealthFile: process.env.WORKER_HEALTH_FILE || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: Array.from(new Set([
    process.env.FRONTEND_URL || 'http://localhost:5173',
    ...(productionLike ? [] : ['http://localhost:5173','http://127.0.0.1:5173','http://localhost:8080','http://127.0.0.1:8080']),
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : [])
  ])).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY || '1',
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '2mb',
  cookieSecure: process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production',
  autoMigrate: productionLike ? process.env.AUTO_MIGRATE === 'true' : process.env.AUTO_MIGRATE !== 'false',
  autoSeed: process.env.AUTO_SEED === 'true' || (process.env.NODE_ENV !== 'production' && process.env.AUTO_SEED !== 'false'),
  telemetryMode: process.env.TELEMETRY_MODE || 'demo', // 'demo' | 'live'
  
  // Local observability datasource URLs (all bounded to localhost)
  prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9090',
  tempoUrl: process.env.TEMPO_URL || 'http://localhost:3200',
  lokiUrl: process.env.LOKI_URL || 'http://localhost:3100',
  otelCollectorUrl: process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318',
  
  // Demo services base URLs
  demoGatewayUrl: process.env.DEMO_GATEWAY_URL || 'http://localhost:4001',
  demoOrdersUrl: process.env.DEMO_ORDERS_URL || 'http://localhost:4002',
  demoPaymentsUrl: process.env.DEMO_PAYMENTS_URL || 'http://localhost:4003',

  // Notification Delivery Configuration (Phase 9)
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'alerts@infrapulse.io'
  },
  notificationMockMode: process.env.NOTIFICATION_MOCK_MODE === 'true' || process.env.NODE_ENV === 'test',
  notificationWorkerEnabled: process.env.NOTIFICATION_WORKER_ENABLED !== 'false',
  appBaseUrl: process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173',

  // Integration Security & Encryption (Phase 19)
  integrationEncryptionKey: readSetting('INTEGRATION_ENCRYPTION_KEY',productionLike ? '' : 'infrapulse-aes256-default-key-32b!'),

  // AWS EC2 Governed Lifecycle Management (Phase 23E)
  awsLifecycleMutationsEnabled: process.env.AWS_LIFECYCLE_MUTATIONS_ENABLED === 'true',
  awsAllowedInstanceIds: (process.env.AWS_ALLOWED_INSTANCE_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  infraPulseHostInstanceId: process.env.INFRAPULSE_HOST_INSTANCE_ID || '',

  // Governed Docker & Kubernetes Lifecycle Management (Phase 23F)
  dockerLifecycleEnabled: process.env.DOCKER_LIFECYCLE_ENABLED === 'true',
  dockerAllowedContainers: (process.env.DOCKER_ALLOWED_CONTAINERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH || (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'),
  infraPulseHostContainer: process.env.INFRAPULSE_HOST_CONTAINER || 'infrapulse-backend',

  kubernetesLifecycleEnabled: process.env.KUBERNETES_LIFECYCLE_ENABLED === 'true',
  kubernetesAllowedNamespaces: (process.env.KUBERNETES_ALLOWED_NAMESPACES || 'infrapulse,staging,dev,development,test,qa')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  kubernetesAllowedWorkloads: (process.env.KUBERNETES_ALLOWED_WORKLOADS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Governed Automated Remediation Intelligence (Phase 23J)
  remediationRecommendationsEnabled: process.env.REMEDIATION_RECOMMENDATIONS_ENABLED === 'true',
  remediationDryRunEnabled: process.env.REMEDIATION_DRY_RUN_ENABLED !== 'false',
  remediationExecutionEnabled: process.env.REMEDIATION_EXECUTION_ENABLED === 'true',
  remediationProductionEnabled: process.env.REMEDIATION_PRODUCTION_ENABLED === 'true',
  remediationApprovalTtlMinutes: parseInt(process.env.REMEDIATION_APPROVAL_TTL_MINUTES || '60', 10),

  // PostgreSQL Database Configuration
  db: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || (productionLike?'5432':'5434')),
    database: process.env.NODE_ENV === 'test' ? (process.env.PGDATABASE_TEST || 'infrapulse_test') : (process.env.PGDATABASE || 'infrapulse'),
    user: process.env.PGUSER || 'postgres',
    password: readSetting('PGPASSWORD',productionLike ? '' : 'postgres'),
    sslMode: process.env.PGSSLMODE || (productionLike ? 'verify-full' : 'disable'),
    sslRootCert: readSetting('PGSSLROOTCERT'),
    connectionString: process.env.DATABASE_URL || '',
    max: Number(process.env.PGMAX || (productionLike?'6':'20')),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || '10000'),
    connectionTimeoutMillis: 5000
  }
};

/**
 * Validates essential environment configuration on application startup.
 * Fails fast on invalid production settings; logs clear operational warnings.
 */
export function validateEnvironment() {
  const isProd = config.nodeEnv === 'production';
  const errors = validateProductionConfig(config);
  const warnings = [];

  if (!config.db.host && !config.db.connectionString) {
    errors.push('PGHOST database host is required.');
  }

  if (isProd) {
    if (config.integrationEncryptionKey === 'infrapulse-aes256-default-key-32b!') {
      warnings.push('INTEGRATION_ENCRYPTION_KEY is using the default development key. Set a secure 32-byte secret in production/staging.');
    }
    if (config.db.password === 'postgres' || !config.db.password) {
      warnings.push('Insecure database password detected in production environment.');
    }
    if (config.frontendUrl.includes('localhost')) {
      warnings.push('FRONTEND_URL points to localhost in production mode.');
    }
    if (!config.slackWebhookUrl && !config.smtp.host && !config.notificationMockMode) {
      warnings.push('No notification providers configured; outbound notification delivery is not ready.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment Configuration Error:\n - ${errors.join('\n - ')}`);
  }

  return { valid: true, warnings };
}
