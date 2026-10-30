import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Queries Prometheus metrics via its HTTP v1 API.
 * 
 * @param {string} query - PromQL query string
 * @param {Object} [options]
 * @returns {Promise<Object>} Normalized Prometheus result
 */
export async function queryPrometheus(query, options = {}) {
  if (!query || typeof query !== 'string') {
    throw ApiError.badRequest('A valid query parameter is required for Prometheus queries.');
  }

  const timeoutMs = options.timeoutMs || 2500;
  const url = new URL(`${config.prometheusUrl}/api/v1/query`);
  url.searchParams.set('query', query.trim());

  if (options.time) {
    url.searchParams.set('time', options.time);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Prometheus returned status ${res.status}: ${body}`);
    }

    const data = await res.json();
    if (data.status !== 'success') {
      throw new Error(data.error || 'Prometheus query failed');
    }

    return {
      source: 'prometheus',
      query,
      resultType: data.data.resultType,
      result: data.data.result
    };
  } catch (err) {
    throw ApiError.internal(`Failed to reach Prometheus at ${config.prometheusUrl}: ${err.message}`);
  }
}

