import app from './app.js';
import { config, validateEnvironment } from './config/env.js';
import { checkConnection, waitForConnection, closePool } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/notificationDispatcher.service.js';
import { logger } from './utils/logger.js';
import {createShutdown} from './utils/shutdown.js';

const PORT = config.port;

async function bootstrap() {
  logger.info('Initializing InfraPulse Backend Server...', {
    port: PORT,
    nodeEnv: config.nodeEnv,
    telemetryMode: config.telemetryMode
  });

  // 1. Environment validation
  try {
    const { warnings } = validateEnvironment();
    if (warnings && warnings.length > 0) {
      warnings.forEach(w => logger.warn(`Configuration warning: ${w}`));
    }
  } catch (envErr) {
    logger.error('Fatal configuration error during startup:', { error: envErr.message });
    process.exit(1);
  }

  // 2. Explicit PostgreSQL Connection Verification
  const dbStatus = await waitForConnection({
    retries: config.nodeEnv === 'test' ? 1 : 15,
    delayMs: 2000
  });
  if (!dbStatus.connected) {
    logger.error('CRITICAL STARTUP ERROR: PostgreSQL database is unavailable.', {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      error: dbStatus.error
    });
    process.exit(1);
  }

  logger.info('Connected to PostgreSQL successfully.', {
    database: config.db.database,
    host: config.db.host,
    port: config.db.port,
    version: dbStatus.version || 'v16',
    latencyMs: dbStatus.latencyMs
  });

  // 3. Run pending migrations & idempotent seeding
  try {
    if (config.autoMigrate) {
      await runMigrations();
    }
    if (config.autoSeed) {
      await seedDatabase();
    }
  } catch (err) {
    logger.error('Database migration/seed error:', { code: err.code });
    process.exit(1);
  }

  // 4. Start Express server & optional background notification worker
  const server = app.listen(PORT, config.bindHost, () => {
    logger.info(`InfraPulse Backend Server listening on port ${PORT}`, {
      port: PORT,
      url: `http://localhost:${PORT}`,
      mode: config.nodeEnv,
      workerEnabled: config.notificationWorkerEnabled
    });

    if (config.notificationWorkerEnabled) {
      startBackgroundWorker(5000);
      logger.info('Integrated notification queue worker started.');
    } else {
      logger.info('Integrated worker disabled (configured for standalone worker service).');
    }
  });

  server.requestTimeout=30000;
  server.headersTimeout=15000;
  const shutdown=createShutdown({stopWorkers:()=>stopBackgroundWorker(),closeDatabase:closePool,timeoutMs:config.shutdownTimeoutMs,closeHttp:()=>{app.locals.draining=true;return new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections?.();});}});
  server.on('error',error=>{logger.error('HTTP listener failed',{code:error.code});closePool().finally(()=>process.exit(1));});

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  logger.error('Fatal unhandled exception during bootstrap:', { code: err.code });
  process.exit(1);
});
