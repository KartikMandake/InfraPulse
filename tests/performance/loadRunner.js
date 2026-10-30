/**
 * Performance Benchmark Engine & Load Runner
 * Provides statistical percentile calculation (p50, p90, p95, p99),
 * concurrency stepping, and JSON reporting without third-party CLI dependencies.
 */

export function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return Math.round(sorted[idx] * 100) / 100;
  };

  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = Math.round((sum / sorted.length) * 100) / 100;

  return {
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    avg
  };
}

/**
 * Executes a load stage across concurrent workers.
 *
 * @param {Object} options
 * @param {Function} options.requestFn - Async function returning { status, ok }
 * @param {number} options.concurrency - Concurrent workers
 * @param {number} options.durationMs - Duration in milliseconds
 * @param {number} [options.targetRps] - Optional rate limit
 */
export async function runLoadStage({ requestFn, concurrency = 5, durationMs = 3000, targetRps = 0 }) {
  const latencies = [];
  let successCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  const statusCodes = {};

  const startTime = Date.now();
  const endTime = startTime + durationMs;
  let active = true;

  async function worker() {
    while (active && Date.now() < endTime) {
      const reqStart = performance.now();
      try {
        const res = await requestFn();
        const duration = performance.now() - reqStart;
        latencies.push(duration);

        const status = res?.status || (res?.ok ? 200 : 500);
        statusCodes[status] = (statusCodes[status] || 0) + 1;

        if (status >= 200 && status < 400) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
          timeoutCount++;
        } else {
          errorCount++;
        }
        statusCodes['error'] = (statusCodes['error'] || 0) + 1;
      }

      if (targetRps > 0) {
        const sleepMs = Math.max(1, Math.floor(1000 / (targetRps / concurrency)));
        await new Promise(r => setTimeout(r, sleepMs));
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const totalRequests = successCount + errorCount + timeoutCount;
  const rps = totalTimeSec > 0 ? Math.round((totalRequests / totalTimeSec) * 10) / 10 : 0;
  const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0;
  const timeoutRate = totalRequests > 0 ? Math.round((timeoutCount / totalRequests) * 10000) / 100 : 0;

  return {
    concurrency,
    durationMs,
    totalRequests,
    successCount,
    errorCount,
    timeoutCount,
    rps,
    errorRate,
    timeoutRate,
    statusCodes,
    percentiles: calculatePercentiles(latencies)
  };
}

