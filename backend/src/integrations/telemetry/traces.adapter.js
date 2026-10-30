import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Queries Grafana Tempo for distributed trace details by traceId.
 * 
 * @param {string} traceId - Hex 128-bit / 64-bit trace ID
 * @param {Object} [options]
 * @returns {Promise<Object>} Normalized trace spans
 */
export async function queryTempoTrace(traceId, options = {}) {
  if (!traceId || typeof traceId !== 'string') {
    throw ApiError.badRequest('A valid traceId parameter is required to query Grafana Tempo.');
  }

  const timeoutMs = options.timeoutMs || 2500;
  const url = `${config.tempoUrl}/api/traces/${traceId.trim()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return {
        source: 'tempo',
        traceId,
        spans: [],
        found: false
      };
    }

    if (!res.ok) {
      throw new Error(`Tempo returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // Normalize Tempo trace format
    return {
      source: 'tempo',
      traceId,
      found: true,
      raw: data
    };
  } catch (err) {
    throw ApiError.internal(`Failed to reach Tempo at ${config.tempoUrl}: ${err.message}`);
  }
}

