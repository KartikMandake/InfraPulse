// ==============================================================================
// InfraPulse - Cloud Lifecycle Policies & Kill Switch
// Safety rules, critical dependency protection, and emergency stop governance
// ==============================================================================

import {query} from '../../../db/connection.js';

export const lifecyclePolicy = {
  async getKillSwitchState() {
    try {
      const {rows}=await query('SELECT active,enabled_at,enabled_by,reason FROM cloud_emergency_state WHERE singleton=true');
      if(!rows[0])throw new Error('Missing emergency state');
      return {active:rows[0].active,enabledAt:rows[0].enabled_at,enabledBy:rows[0].enabled_by,reason:rows[0].reason};
    } catch { return {active:true,enabledAt:null,enabledBy:null,reason:'Safety state unavailable: mutations fail closed',unavailable:true}; }
  },

  async setKillSwitch(enabled, { user, reason } = {}) {
    if(typeof enabled!=='boolean')throw new Error('Invalid kill switch state: enabled must be boolean');
    await query('UPDATE cloud_emergency_state SET active=$1,enabled_at=CASE WHEN $1 THEN now() ELSE NULL END,enabled_by=$2,reason=$3,updated_at=now() WHERE singleton=true',[enabled,enabled?(user?.email||user?.name||'admin'):null,enabled?(reason||'Emergency administrative freeze'):null]);
    return this.getKillSwitchState();
  },

  /**
   * Evaluates whether an action is fundamentally prohibited by policy.
   */
  async evaluateActionPolicy(resource, action) {
    const blockers = [];
    const warnings = [];

    // Rule 1: Kill switch blocks all mutating actions
    const killSwitch=await this.getKillSwitchState();
    if (killSwitch.active && ['start', 'stop', 'restart', 'scale_up', 'scale_down'].includes(action)) {
      blockers.push(`Global cloud lifecycle kill switch is ACTIVE (${killSwitch.reason || 'Safety lock'}). All mutating operations are suspended.`);
    }

    // Rule 2: Critical dependencies (like PostgreSQL database) cannot be stopped if marked critical
    if (action === 'stop' && resource.is_critical_dependency) {
      warnings.push(`Resource '${resource.name}' is marked as a CRITICAL PLATFORM DEPENDENCY. Halting this resource will cascade to dependent services.`);
    }

    // Rule 3: Protected persistent storage cannot be deleted or purged
    if (resource.persistence_requirements?.volume_name || resource.persistence_requirements?.has_pvc) {
      if (['delete', 'purge', 'destroy'].includes(action)) {
        blockers.push(`Resource '${resource.name}' has active persistent storage attached. Destructive storage actions are strictly forbidden.`);
      }
    }

    // Rule 4: Production governance
    if (resource.environment === 'production' && ['stop', 'restart', 'scale_down'].includes(action)) {
      warnings.push(`Resource is in PRODUCTION. Requires elevated Admin approval with mandatory two-person review.`);
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings
    };
  }
};

