import fs from 'node:fs';
import {X509Certificate} from 'node:crypto';

export function readSetting(name, fallback = '') {
  const value = process.env[name];
  const file = process.env[`${name}_FILE`];
  if (value && file) throw new Error(`Configure ${name} or ${name}_FILE, not both.`);
  if (!file) return value ?? fallback;
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  } catch {
    throw new Error(`Cannot read configured ${name}_FILE.`);
  }
}

export function isLocalDatabase(host) {
  return host.startsWith('/') || ['localhost', '127.0.0.1', '::1'].includes(host);
}

export function validateProductionConfig(config, environment = process.env) {
  const errors = [];
  if (!['development', 'staging', 'production', 'test'].includes(config.appEnv)) errors.push('APP_ENV is invalid.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) errors.push('PORT must be between 1 and 65535.');
  if (!Number.isInteger(config.db.max) || config.db.max < 1 || config.db.max > 100) errors.push('PGMAX must be between 1 and 100.');
  if (!Number.isInteger(config.db.port) || config.db.port < 1 || config.db.port > 65535) errors.push('PGPORT must be between 1 and 65535.');
  if (!Number.isInteger(config.db.idleTimeoutMillis) || config.db.idleTimeoutMillis < 0) errors.push('PG_IDLE_TIMEOUT_MS must be a nonnegative integer.');
  if (!Number.isInteger(config.shutdownTimeoutMs) || config.shutdownTimeoutMs < 1000 || config.shutdownTimeoutMs > 120000) errors.push('SHUTDOWN_TIMEOUT_MS must be between 1000 and 120000.');
  if (!config.productionLike) return errors;
  if(config.nodeEnv!=='production'||!['production','staging'].includes(config.appEnv))errors.push('Production/staging requires NODE_ENV=production and APP_ENV=production or staging.');
  const weak = value => !value || /^(postgres|password|changeme|change-me|replace-me)$/i.test(value) || /your[_-]|replace[_-]with|<[^>]+>/.test(value);
  if (weak(config.integrationEncryptionKey) || config.integrationEncryptionKey === 'infrapulse-aes256-default-key-32b!' || config.integrationEncryptionKey.length < 32 || new Set(config.integrationEncryptionKey).size < 8) errors.push('INTEGRATION_ENCRYPTION_KEY requires a non-default secret of at least 32 characters.');
  if (config.db.connectionString) errors.push('Production requires separate PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD settings; DATABASE_URL is not accepted.');
  for (const name of ['PGHOST', 'PGDATABASE', 'PGUSER']) if (!environment[name]) errors.push(`${name} must be explicit in staging/production.`);
  if (weak(config.db.password) || config.db.password.length < 16) errors.push('PGPASSWORD requires a non-default secret of at least 16 characters.');
  if (!['verify-full', 'disable'].includes(config.db.sslMode)) errors.push('PGSSLMODE must be verify-full or disable.');
  if (config.db.sslMode === 'disable' && !isLocalDatabase(config.db.host)) errors.push('Remote PostgreSQL requires PGSSLMODE=verify-full.');
  if (config.db.sslMode === 'verify-full' && !config.db.sslRootCert) errors.push('PGSSLROOTCERT_FILE is required for verified PostgreSQL TLS.');
  if(config.db.sslMode==='verify-full'&&config.db.sslRootCert){try{if(!new X509Certificate(config.db.sslRootCert).ca)throw new Error();}catch{errors.push('PGSSLROOTCERT_FILE must contain a valid PEM CA certificate or bundle.');}}
  for (const origin of config.corsOrigins) {
    try { const url = new URL(origin); if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin) throw new Error(); }
    catch { errors.push('FRONTEND_URL and CORS_ORIGIN must contain exact HTTPS origins.'); break; }
  }
  try { if (new URL(config.frontendUrl).protocol !== 'https:') errors.push('FRONTEND_URL must use HTTPS.'); } catch { errors.push('FRONTEND_URL must be an HTTPS URL.'); }
  if (!config.cookieSecure) errors.push('COOKIE_SECURE must be true.');
  if (environment.TRUST_PROXY!=='1') errors.push('TRUST_PROXY must be 1 for the reviewed private frontend-to-backend proxy topology.');
  if (config.autoMigrate || config.autoSeed) errors.push('AUTO_MIGRATE and AUTO_SEED must be false; use the separate migration procedure.');
  if (config.awsLifecycleMutationsEnabled || config.dockerLifecycleEnabled || config.kubernetesLifecycleEnabled || config.remediationExecutionEnabled || config.remediationProductionEnabled) errors.push('All infrastructure execution flags must remain false until release blockers are resolved.');
  if ((environment.AWS_REGION || 'ap-south-1') !== 'ap-south-1' || (environment.AWS_ALLOWED_REGIONS || 'ap-south-1') !== 'ap-south-1') errors.push('AWS region settings must be ap-south-1.');
  if (environment.DEBUG_SQL === 'true') errors.push('DEBUG_SQL must be disabled.');
  return errors;
}
