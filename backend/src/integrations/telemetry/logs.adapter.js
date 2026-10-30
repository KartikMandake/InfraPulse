import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Queries Grafana Loki log streams using LogQL.
 * 
 * @param {string} logql - LogQL query expression, e.g. '{app="orders-service"}'
 * @param {Object} [options]
 * @returns {Promise<Object>} Normalized Loki logs
 */
export async function queryLokiLogs(logql, options = {}) {
  if (!logql || typeof logql !== 'string') {
    throw ApiError.badRequest('A valid logql query string is required for Loki.');
  }

  const timeoutMs = options.timeoutMs || 2500;
  const limit = options.limit || 50;
  const url = new URL(`${config.lokiUrl}/loki/api/v1/query_range`);
  url.searchParams.set('query', logql.trim());
  url.searchParams.set('limit', limit.toString());

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Loki returned status ${res.status}: ${body}`);
    }

    const data = await res.json();
    if (data.status !== 'success') {
      throw new Error(data.error || 'Loki query execution failed');
    }

    return {
      source: 'loki',
      query: logql,
      resultType: data.data.resultType,
      streams: data.data.result
    };
  } catch (err) {
    throw ApiError.internal(`Failed to reach Loki at ${config.lokiUrl}: ${err.message}`);
  }
}

