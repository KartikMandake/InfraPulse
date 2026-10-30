/**
 * Base AI Provider Abstract Interface
 */

export class AiProvider {
  constructor(config = {}) {
    this.name = 'base';
    this.config = config;
  }

  /**
   * Generates a grounded structured investigation analysis based on evidence context and user query.
   *
   * @param {Object} params
   * @param {string} params.prompt - User investigation question
   * @param {Object} params.evidenceContext - Bounded, redacted incident evidence context
   * @param {Array} [params.conversationHistory] - Previous messages in conversation
   * @param {Object} [params.options] - Runtime options (maxTokens, timeoutMs, model)
   * @returns {Promise<Object>} Structured response contract
   */
  async generateInvestigationResponse(params) {
    throw new Error('generateInvestigationResponse() must be implemented by specific AI provider.');
  }

  /**
   * Checks provider operational health and connectivity.
   */
  async checkHealth() {
    return { available: false, reason: 'Unimplemented' };
  }
}

