// ==============================================================================
// InfraPulse - Cloud Resource Scheduling Service
// Manages automated weekday stop/start schedules with Asia/Kolkata timezone support
// ==============================================================================

import crypto from 'crypto';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { recordAuditEvent } from '../../audit.service.js';

export const scheduleService = {
  async getAllSchedules() {
    return cloudLifecycleRepository.getAllSchedules();
  },

  async getScheduleById(id) {
    return cloudLifecycleRepository.getScheduleById(id);
  },

  async createSchedule(data, user) {
    if (!data.resource_id) throw new Error('resource_id is required.');
    if (!data.action || !['start', 'stop', 'scale_down'].includes(data.action)) {
      throw new Error("action must be 'start', 'stop', or 'scale_down'.");
    }

    const id = data.id || `sched_${crypto.randomBytes(6).toString('hex')}`;
    const schedule = await cloudLifecycleRepository.upsertSchedule({
      id,
      resource_id: data.resource_id,
      name: data.name || `Automated ${data.action} schedule`,
      action: data.action,
      cron_expression: data.cron_expression || '0 20 * * 1-5',
      timezone: data.timezone || 'Asia/Kolkata',
      enabled: data.enabled !== false,
      is_paused: data.is_paused || false,
      days_of_week: data.days_of_week || [1, 2, 3, 4, 5],
      time_of_day: data.time_of_day || '20:00',
      missed_execution_recovery: data.missed_execution_recovery !== false,
      created_by: user?.email || user?.name || 'system'
    });

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'system',
      action: 'CLOUD_SCHEDULE_CREATED',
      resourceType: 'cloud_schedule',
      resourceId: id,
      details: { resource_id: data.resource_id, action: data.action, timezone: schedule.timezone }
    });

    return schedule;
  },

  async toggleSchedulePause(id, isPaused, user) {
    const existing = await cloudLifecycleRepository.getScheduleById(id);
    if (!existing) throw new Error(`Schedule ${id} not found.`);

    const updated = await cloudLifecycleRepository.updateSchedule(id, { is_paused: isPaused });

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'system',
      action: isPaused ? 'CLOUD_SCHEDULE_PAUSED' : 'CLOUD_SCHEDULE_RESUMED',
      resourceType: 'cloud_schedule',
      resourceId: id,
      details: { previousPaused: existing.is_paused, newPaused: isPaused }
    });

    return updated;
  },

  async updateSchedule(id, updates, user) {
    const existing = await cloudLifecycleRepository.getScheduleById(id);
    if (!existing) throw new Error(`Schedule ${id} not found.`);

    const updated = await cloudLifecycleRepository.updateSchedule(id, updates);

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'system',
      action: 'CLOUD_SCHEDULE_UPDATED',
      resourceType: 'cloud_schedule',
      resourceId: id,
      details: updates
    });

    return updated;
  },

  /**
   * Evaluates if any scheduled operations were missed during a platform outage or maintenance.
   */
  async checkMissedExecutions(referenceDate = new Date()) {
    const schedules = await cloudLifecycleRepository.getAllSchedules();
    const missed = [];

    for (const sched of schedules) {
      if (!sched.enabled || sched.is_paused || !sched.missed_execution_recovery) continue;

      // In simulation mode, evaluate if next_run_at is in the past
      if (sched.next_run_at && new Date(sched.next_run_at) < referenceDate) {
        missed.push({
          scheduleId: sched.id,
          resourceId: sched.resource_id,
          action: sched.action,
          scheduledTime: sched.next_run_at,
          detectedAt: referenceDate.toISOString(),
          recoveryAction: 'QUEUED_FOR_EVALUATION'
        });
      }
    }

    return {
      evaluatedCount: schedules.length,
      missedCount: missed.length,
      missedExecutions: missed
    };
  }
};

