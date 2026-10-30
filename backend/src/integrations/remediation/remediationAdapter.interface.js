/**
 * Base Abstract Remediation Adapter Interface
 *
 * Enforces contract for all remediation and diagnostic execution adapters.
 * Every adapter must provide:
 * - Allowlisted action validation
 * - Input sanitization
 * - Bounded execution timeouts
 * - Structured return contracts
 */

export class RemediationAdapter {
  constructor(name = 'base-adapter') {
    this.name = name;
  }

  /**
   * Executes a predefined, allowlisted action.
   *
   * @param {Object} params
   * @param {string} params.action - One of the allowlisted adapter actions
   * @param {string} params.targetServiceId - Service identifier
   * @param {Object} [params.parameters={}] - Action parameters
   * @param {Object} [params.context={}] - Incident and execution metadata
   * @returns {Promise<Object>} Structured result { success, action, simulated, durationMs, details }
   */
  async executeAction({ action, targetServiceId, parameters = {}, context = {} }) {
    throw new Error('RemediationAdapter.executeAction() must be implemented by subclass.');
  }

  isActionSupported(action) {
    return false;
  }
}

