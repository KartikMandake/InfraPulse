import { config } from '../../config/env.js';

async function checkEndpoint(url, timeoutMs = 800) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return {
      connected: res.ok,
      status: res.status,
      statusText: res.statusText
    };
  } catch (err) {
    return {
      connected: false,
      error: err.name === 'AbortError' ? 'Connection timeout' : err.message
    };
  }
}

/**
 * Checks connectivity to all configured local telemetry datasources.
 */
export async function getDatasourcesStatus() {
  const [promStatus, tempoStatus, lokiStatus, otelStatus, demoGwStatus] = await Promise.all([
    checkEndpoint(`${config.prometheusUrl}/-/healthy`),
    checkEndpoint(`${config.tempoUrl}/status`),
    checkEndpoint(`${config.lokiUrl}/ready`),
    checkEndpoint(`${config.otelCollectorUrl}`),
    checkEndpoint(`${config.demoGatewayUrl}/health`)
  ]);

  const allConnected = promStatus.connected && tempoStatus.connected && lokiStatus.connected;

  return {
    telemetryMode: config.telemetryMode,
    isLiveStackAvailable: allConnected,
    datasources: {
      prometheus: {
        url: config.prometheusUrl,
        type: 'metrics',
        ...promStatus
      },
      tempo: {
        url: config.tempoUrl,
        type: 'traces',
        ...tempoStatus
      },
      loki: {
        url: config.lokiUrl,
        type: 'logs',
        ...lokiStatus
      },
      otelCollector: {
        url: config.otelCollectorUrl,
        type: 'collector',
        ...otelStatus
      },
      demoServicesGateway: {
        url: config.demoGatewayUrl,
        type: 'service_mesh',
        ...demoGwStatus
      }
    },
    checkedAt: new Date().toISOString()
  };
}

