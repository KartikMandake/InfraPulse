import { config, validateEnvironment } from './config/env.js';
import { checkConnection, closePool } from './db/connection.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/notificationDispatcher.service.js';
import { logger } from './utils/logger.js';

async function startWorkerService() {
  logger.info('Starting standalone InfraPulse Notification Worker Service...');

  // Validate environment & DB connectivity
  validateEnvironment();
  const dbStatus = await checkConnection();
  if (!dbStatus.connected) {
    logger.error('Worker failed to connect to PostgreSQL database.', { error: dbStatus.error });
    process.exit(1);
  }

  logger.info('Worker connected to PostgreSQL. Starting queue polling loop...', {
    database: config.db.database,
    host: config.db.host
  });

  // Start polling queue every 5 seconds
  startBackgroundWorker(5000);

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Draining worker queue and shutting down...`);
    stopBackgroundWorker();
    await closePool();
    logger.info('Notification worker terminated cleanly.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkerService().catch(err => {
  logger.error('Worker encountered unhandled fatal exception:', { error: err.message, stack: err.stack });
  process.exit(1);
});

