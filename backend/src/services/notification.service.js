import { config } from '../config/env.js';
import * as notifRepo from '../repositories/notification.repository.js';
import { buildSlackPayload, buildEmailPayload } from './notificationTemplates.service.js';
import { dispatchDelivery, processDeliveryQueue } from './notificationDispatcher.service.js';
import { ApiError } from '../utils/ApiError.js';

// Severity rank comparator: SEV-1 (highest) > SEV-2 > SEV-3
const SEVERITY_RANKS = {
  'SEV-1': 3,
  'SEV-2': 2,
  'SEV-3': 1
};

function meetsSeverityThreshold(incidentSeverity, minSeverity) {
  const incRank = SEVERITY_RANKS[incidentSeverity] || 2;
  const minRank = SEVERITY_RANKS[minSeverity] || 2;
  return incRank >= minRank;
}

/**
 * Triggers decoupled notifications for an incident event.
 * Ensures strict idempotency and resilient error boundaries.
 */
export async function triggerIncidentNotification({
  eventType,
  incident,
  topCandidate = null,
  context = {}
}) {
  if (!incident || !incident.id) return [];

  const createdDeliveries = [];

  try {
    // 1. Find matching enabled preferences for this event type
    const preferences = await notifRepo.findPreferencesByEvent(eventType);
    if (!preferences || preferences.length === 0) {
      return [];
    }

    // 2. Load channels
    const channels = await notifRepo.findAllChannels();
    const channelsById = new Map(channels.map(c => [c.id, c]));

    for (const pref of preferences) {
      const channel = channelsById.get(pref.channelId);
      if (!channel || !channel.enabled) continue;

      // Severity check
      if (!meetsSeverityThreshold(incident.severity, pref.minSeverity)) {
        continue;
      }

      // Generate stable idempotency key
      // Ensures repeated evaluations of the same event cannot create duplicate deliveries
      const idempotencyQualifier = context.qualifier || incident.lead || incident.status || 'default';
      const idempotencyKey = `${eventType}_${incident.id}_${channel.id}_${incident.severity}_${idempotencyQualifier}`;

      // Check if already created
      const existing = await notifRepo.findDeliveryByIdempotencyKey(idempotencyKey);
      if (existing) {
        continue;
      }

      // Build channel payload
      let payload;
      let recipient;

      if (channel.type === 'slack') {
        payload = buildSlackPayload({ incident, eventType, topCandidate, context });
        recipient = channel.config?.channel || '#incidents-war-room';
      } else if (channel.type === 'email') {
        payload = buildEmailPayload({ incident, eventType, topCandidate, context });
        recipient = Array.isArray(channel.config?.recipients)
          ? channel.config.recipients.join(', ')
          : (channel.config?.recipients || 'sre-oncall@infrapulse.io');
      } else {
        continue;
      }

      // Create persistent delivery record in PostgreSQL
      const delivery = await notifRepo.createDeliveryRecord({
        idempotencyKey,
        channelId: channel.id,
        channelType: channel.type,
        eventType,
        incidentId: incident.id,
        recipient,
        payload,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3
      });

      if (delivery) {
        createdDeliveries.push(delivery);
        // Attempt immediate dispatch
        dispatchDelivery(delivery).catch(err => {
          console.warn('[NotificationService] Async dispatch scheduled for retry:', err.message);
        });
      }
    }
  } catch (err) {
    // Non-blocking error boundary: notification failure must never crash core incident flow
    console.error('[NotificationService Error]: Failed to trigger notifications:', err.message);
  }

  return createdDeliveries;
}

/**
 * Returns safe notification settings and provider connection status.
 * Webhook URL secrets and SMTP passwords are strictly omitted.
 */
export async function getNotificationSettings() {
  const [channels, preferences] = await Promise.all([
    notifRepo.findAllChannels(),
    notifRepo.findAllPreferences()
  ]);

  const providerStatus = {
    slack: {
      configured: Boolean(config.slackWebhookUrl),
      isMock: config.notificationMockMode || !config.slackWebhookUrl,
      destination: config.slackWebhookUrl ? 'hooks.slack.com (Masked)' : 'Mock In-Memory Adapter'
    },
    smtp: {
      configured: Boolean(config.smtp.host),
      isMock: config.notificationMockMode || !config.smtp.host,
      host: config.smtp.host || 'Mock In-Memory Transport',
      port: config.smtp.port,
      from: config.smtp.from
    }
  };

  return {
    channels,
    preferences,
    providerStatus
  };
}

/**
 * Updates channel configuration or preference toggles.
 */
export async function updateChannelSettings(channelId, updates) {
  const channel = await notifRepo.findChannelById(channelId);
  if (!channel) {
    throw ApiError.notFound(`Notification channel "${channelId}" not found.`);
  }

  // Never accept raw secrets in channel config; configs hold display channels/recipient lists only
  const safeConfig = updates.config ? { ...channel.config, ...updates.config } : channel.config;
  delete safeConfig.secret;
  delete safeConfig.token;
  delete safeConfig.password;

  return notifRepo.updateChannel(channelId, {
    name: updates.name !== undefined ? updates.name : channel.name,
    enabled: updates.enabled !== undefined ? updates.enabled : channel.enabled,
    config: safeConfig
  });
}

/**
 * Updates notification preference by ID.
 */
export async function updatePreferenceSettings(prefId, updates) {
  return notifRepo.updatePreference(prefId, updates);
}

/**
 * Manually retries a failed delivery.
 */
export async function retryDelivery(deliveryId) {
  const delivery = await notifRepo.findDeliveryById(deliveryId);
  if (!delivery) {
    throw ApiError.notFound(`Notification delivery with ID "${deliveryId}" was not found.`);
  }

  if (delivery.status === 'sent') {
    throw ApiError.badRequest('Notification has already been sent successfully.');
  }

  // Reset to pending
  await notifRepo.updateDeliveryStatus(deliveryId, {
    status: 'pending',
    nextRetryAt: null,
    lastError: null
  });

  const refreshed = await notifRepo.findDeliveryById(deliveryId);
  return dispatchDelivery(refreshed);
}

/**
 * Triggers a test delivery to verify provider connectivity.
 */
export async function sendTestNotification({ channelType, recipient }) {
  if (!['slack', 'email'].includes(channelType)) {
    throw ApiError.badRequest(`Unsupported channel type "${channelType}".`);
  }

  const dummyIncident = {
    id: `INC-TEST-${Date.now().toString(36).toUpperCase()}`,
    title: 'Verification Ping: InfraPulse Alerting Rail Check',
    severity: 'SEV-2',
    status: 'investigating',
    serviceName: 'telemetry-pipeline',
    serviceId: 'telemetry-pipeline',
    lead: 'Sarah Chen (Admin)',
    summary: 'Automated test transmission to verify Slack Block Kit / SMTP webhook routing.'
  };

  const payload = channelType === 'slack'
    ? buildSlackPayload({ incident: dummyIncident, eventType: 'test.ping' })
    : buildEmailPayload({ incident: dummyIncident, eventType: 'test.ping' });

  const delivery = await notifRepo.createDeliveryRecord({
    idempotencyKey: `test_${channelType}_${Date.now()}`,
    channelType,
    eventType: 'test.ping',
    incidentId: dummyIncident.id,
    recipient: recipient || (channelType === 'slack' ? '#incidents-war-room' : 'test@infrapulse.io'),
    payload,
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 1
  });

  const result = await dispatchDelivery(delivery);
  return {
    success: result.status === 'sent',
    delivery: result
  };
}

/**
 * Lists paginated delivery logs.
 */
export async function listDeliveries(filters = {}) {
  return notifRepo.findDeliveries(filters);
}

/**
 * Gets delivery details by ID.
 */
export async function getDeliveryDetails(deliveryId) {
  const delivery = await notifRepo.findDeliveryById(deliveryId);
  if (!delivery) {
    throw ApiError.notFound(`Notification delivery with ID "${deliveryId}" was not found.`);
  }
  return delivery;
}

