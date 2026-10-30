import app from './app.js';
import { config, validateEnvironment } from './config/env.js';
import { checkConnection, closePool } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/notificationDispatcher.service.js';
import { logger } from './utils/logger.js';

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
  const dbStatus = await checkConnection();
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
    await runMigrations();
    await seedDatabase();
  } catch (err) {
    logger.error('Database migration/seed error:', { error: err.message, stack: err.stack });
    process.exit(1);
  }

  // 4. Start Express server & optional background notification worker
  const server = app.listen(PORT, () => {
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

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Commencing graceful shutdown...`);

    if (config.notificationWorkerEnabled) {
      stopBackgroundWorker();
    }

    server.close(async (err) => {
      if (err) {
        logger.error('Error during HTTP server close:', { error: err.message });
      }

      await closePool();
      logger.info('HTTP server and PostgreSQL pool closed cleanly. Process exiting.');
      process.exit(0);
    });

    // Forced exit timeout after 10s if connections fail to close
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  logger.error('Fatal unhandled exception during bootstrap:', { error: err.message, stack: err.stack });
  process.exit(1);
});
