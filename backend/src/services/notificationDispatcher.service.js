import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import fs from 'node:fs';
import {logger} from '../utils/logger.js';
import * as notifRepo from '../repositories/notification.repository.js';
import { sanitizeText } from './notificationTemplates.service.js';
import { queueGauge, heartbeatAge, recordOperation } from '../observability/metrics.js';
import { performance } from 'node:perf_hooks';
import { withTenant } from '../security/tenantContext.js';

// In-memory test spy for mock deliveries during automated testing
export const mockDeliveries = {
  slack: [],
  email: [],
  clear() {
    this.slack = [];
    this.email = [];
  }
};

let workerIntervalId = null;

/**
 * Validates outbound Slack webhook URL to prevent SSRF.
 */
export function validateSlackWebhookUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Slack webhook URL is empty or invalid.');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new Error('Invalid webhook URL format.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Insecure protocol. Webhook destination must use HTTPS.');
  }

  const allowedHosts = ['hooks.slack.com', 'slack.com', 'api.slack.com', 'localhost', '127.0.0.1'];
  if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    throw new Error(`Disallowed webhook host "${parsed.hostname}". Must be a valid Slack endpoint.`);
  }

  return true;
}

/**
 * Delivers Slack notification payload.
 */
export async function deliverSlack(delivery) {
  const isMock = config.notificationMockMode || !config.slackWebhookUrl;

  if (isMock) {
    mockDeliveries.slack.push({
      deliveryId: delivery.id,
      recipient: delivery.recipient,
      payload: delivery.payload,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      provider: 'slack',
      messageId: `mock_slack_${Date.now()}`,
      mock: true
    };
  }

  validateSlackWebhookUrl(config.slackWebhookUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(config.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delivery.payload),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Slack API responded with HTTP ${res.status}: ${errText.substring(0, 100)}`);
    }

    return {
      success: true,
      provider: 'slack',
      messageId: `slack_${Date.now()}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Delivers Email notification payload.
 */
export async function deliverEmail(delivery) {
  const recipients = Array.isArray(delivery.recipient) ? delivery.recipient : [delivery.recipient];
  const validRecipients = recipients.filter(r => typeof r === 'string' && r.includes('@'));

  if (validRecipients.length === 0) {
    throw new Error('No valid recipient email addresses specified.');
  }

  const isMock = config.notificationMockMode || !config.smtp.host;

  if (isMock) {
    mockDeliveries.email.push({
      deliveryId: delivery.id,
      recipient: delivery.recipient,
      payload: delivery.payload,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      provider: 'email',
      messageId: `mock_email_${Date.now()}`,
      mock: true
    };
  }

  if (!config.smtp.host) {
    throw new Error('SMTP configuration missing. Host is required.');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 5000,
    socketTimeout: 5000
  });

  const mailOptions = {
    from: config.smtp.from,
    to: validRecipients.join(', '),
    subject: delivery.payload.subject || '[InfraPulse Incident Notification]',
    text: delivery.payload.text || '',
    html: delivery.payload.html || ''
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    provider: 'email',
    messageId: info.messageId || `email_${Date.now()}`
  };
}

/**
 * Calculates bounded exponential backoff.
 */
export function calculateBackoff(attemptCount) {
  // 1st retry: 10s, 2nd: 30s, 3rd+: 60s
  const delays = [10 * 1000, 30 * 1000, 60 * 1000];
  const idx = Math.min(Math.max(attemptCount - 1, 0), delays.length - 1);
  return delays[idx];
}

/**
 * Dispatches a single delivery through its designated provider adapter.
 */
export async function dispatchDelivery(delivery) {
  const attemptCount = (delivery.attemptCount || 0) + 1;

  try {
    let result;
    if (delivery.channelType === 'slack') {
      result = await deliverSlack(delivery);
    } else if (delivery.channelType === 'email') {
      result = await deliverEmail(delivery);
    } else {
      throw new Error(`Unsupported channel type "${delivery.channelType}".`);
    }

    return await notifRepo.updateDeliveryStatus(delivery.id, {
      status: 'sent',
      attemptCount,
      sentAt: new Date().toISOString(),
      lastError: null
    });
  } catch (err) {
    const safeError = sanitizeText(err.message || 'Unknown provider error');
    const hasMoreRetries = attemptCount < (delivery.maxAttempts || 3);
    const nextRetryAt = hasMoreRetries
      ? new Date(Date.now() + calculateBackoff(attemptCount)).toISOString()
      : null;

    return await notifRepo.updateDeliveryStatus(delivery.id, {
      status: 'failed',
      attemptCount,
      nextRetryAt,
      lastError: safeError
    });
  }
}

/**
 * Processes pending items from the persistent delivery queue.
 */
export async function processDeliveryQueue(batchSize = 10, {throwOnError=false} = {}) {
  const start = performance.now();
  let failed = false;
  try {
    const claimed = await notifRepo.claimPendingDeliveries(batchSize);
    if (!claimed || claimed.length === 0) {
      try { queueGauge.set({ state: 'pending' }, 0); } catch {}
      return 0;
    }

    try { queueGauge.set({ state: 'pending' }, claimed.length); } catch {}

    for (const delivery of claimed) {
      if (delivery.tenant_id) {
        await withTenant(delivery.tenant_id, () => dispatchDelivery(delivery));
      } else {
        await dispatchDelivery(delivery);
      }
    }

    return claimed.length;
  } catch (err) {
    failed = true;
    logger.error('Notification queue processing failed',{code:err.code,...(!config.productionLike?{message:err.message}:{})});
    if(throwOnError)throw err;
    return 0;
  } finally {
    try { recordOperation('worker.batch', performance.now() - start, failed); } catch {}
  }
}

/**
 * Starts background queue processing timer.
 */
let activePoll=null;
function heartbeat(healthy){try{heartbeatAge.set(0);}catch{}if(config.workerHealthFile){try{fs.writeFileSync(config.workerHealthFile,JSON.stringify({pid:process.pid,at:Date.now(),healthy}));}catch(error){logger.error('Worker health file update failed',{code:error.code});}}}
export function startBackgroundWorker(intervalMs = 5000,{processBatch=processDeliveryQueue}={}) {
  if (workerIntervalId) return;
  heartbeat(true);
  workerIntervalId = setInterval(() => {
    if(activePoll)return;
    activePoll=Promise.resolve().then(()=>processBatch(10,{throwOnError:true})).then(()=>heartbeat(true)).catch(()=>heartbeat(false)).finally(()=>{activePoll=null;});
  }, intervalMs);

  if (workerIntervalId.unref) {
    workerIntervalId.unref();
  }
}

/**
 * Stops background queue processing timer for graceful shutdown.
 */
export function stopBackgroundWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  return activePoll||Promise.resolve();
}
