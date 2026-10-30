import * as notifService from '../services/notification.service.js';
import { recordAuditEvent } from '../services/audit.service.js';

export async function getNotifications(req, res, next) {
  try {
    const { incidentId, channelType, status, eventType, limit, offset } = req.query;
    const result = await notifService.listDeliveries({
      incidentId,
      channelType,
      status,
      eventType,
      limit,
      offset
    });

    res.json({
      status: 'ok',
      data: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getNotificationById(req, res, next) {
  try {
    const delivery = await notifService.getDeliveryDetails(req.params.notificationId);
    res.json({
      status: 'ok',
      data: delivery
    });
  } catch (err) {
    next(err);
  }
}

export async function retryNotification(req, res, next) {
  try {
    const delivery = await notifService.retryDelivery(req.params.notificationId);

    await recordAuditEvent({
      actor: req.user,
      action: 'notification.manual_retry',
      resourceType: 'notification_delivery',
      resourceId: req.params.notificationId,
      outcome: delivery.status === 'sent' ? 'success' : 'failure',
      metadata: {
        channelType: delivery.channelType,
        attemptCount: delivery.attemptCount,
        status: delivery.status
      },
      req
    });

    res.json({
      status: 'ok',
      message: `Delivery attempt completed with status: ${delivery.status}`,
      data: delivery
    });
  } catch (err) {
    next(err);
  }
}

export async function getSettings(req, res, next) {
  try {
    const settings = await notifService.getNotificationSettings();
    res.json({
      status: 'ok',
      data: settings
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const { channelId, channelUpdates, preferenceId, preferenceUpdates } = req.body;

    if (channelId && channelUpdates) {
      await notifService.updateChannelSettings(channelId, channelUpdates);
    }
    if (preferenceId && preferenceUpdates) {
      await notifService.updatePreferenceSettings(preferenceId, preferenceUpdates);
    }

    await recordAuditEvent({
      actor: req.user,
      action: 'notification.settings_updated',
      resourceType: 'notification_settings',
      resourceId: channelId || preferenceId || 'global',
      outcome: 'success',
      metadata: { channelId, preferenceId },
      req
    });

    const refreshed = await notifService.getNotificationSettings();
    res.json({
      status: 'ok',
      message: 'Notification settings updated successfully.',
      data: refreshed
    });
  } catch (err) {
    next(err);
  }
}

export async function sendTest(req, res, next) {
  try {
    const { channelType, recipient } = req.body;
    const result = await notifService.sendTestNotification({ channelType, recipient });

    await recordAuditEvent({
      actor: req.user,
      action: 'notification.test_delivery',
      resourceType: 'notification_channel',
      resourceId: channelType,
      outcome: result.success ? 'success' : 'failure',
      metadata: {
        channelType,
        recipient: recipient || 'default',
        deliveryStatus: result.delivery?.status
      },
      req
    });

    res.json({
      status: 'ok',
      message: `Test notification sent via ${channelType}. Status: ${result.delivery?.status}`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

