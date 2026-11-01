import { config, validateEnvironment } from './config/env.js';
import { checkConnection, waitForConnection, closePool } from './db/connection.js';
import { startBackgroundWorker, stopBackgroundWorker } from './services/notificationDispatcher.service.js';
import { logger } from './utils/logger.js';
import {createShutdown} from './utils/shutdown.js';

async function startWorkerService() {
  logger.info('Starting standalone InfraPulse Notification Worker Service...');

  // Validate environment & DB connectivity
  validateEnvironment();
  const dbStatus = await waitForConnection({
    retries: config.nodeEnv === 'test' ? 1 : 15,
    delayMs: 2000
  });
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

  const shutdown=createShutdown({stopWorkers:stopBackgroundWorker,closeDatabase:closePool,timeoutMs:config.shutdownTimeoutMs});

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkerService().catch(err => {
  logger.error('Worker encountered unhandled fatal exception:', { code: err.code });
  process.exit(1);
});

