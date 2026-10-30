import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
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
  integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY || 'infrapulse-aes256-default-key-32b!',

  // PostgreSQL Database Configuration
  db: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5434', 10),
    database: process.env.NODE_ENV === 'test' ? (process.env.PGDATABASE_TEST || 'infrapulse_test') : (process.env.PGDATABASE || 'infrapulse'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    connectionString: process.env.DATABASE_URL || '',
    max: parseInt(process.env.PGMAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  }
};

/**
 * Validates essential environment configuration on application startup.
 * Fails fast on invalid production settings; logs clear operational warnings.
 */
export function validateEnvironment() {
  const isProd = config.nodeEnv === 'production';
  const errors = [];
  const warnings = [];

  if (!config.db.host) {
    errors.push('PGHOST database host is required.');
  }

  if (isProd) {
    if (config.db.password === 'postgres' || !config.db.password) {
      warnings.push('Insecure database password detected in production environment.');
    }
    if (config.frontendUrl.includes('localhost')) {
      warnings.push('FRONTEND_URL points to localhost in production mode.');
    }
    if (!config.slackWebhookUrl && !config.smtp.host && !config.notificationMockMode) {
      warnings.push('No notification providers configured in production. Defaulting to mock mode.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment Configuration Error:\n - ${errors.join('\n - ')}`);
  }

  return { valid: true, warnings };
}
