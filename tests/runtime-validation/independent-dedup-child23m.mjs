import './independent23m.mjs';
import { telemetryPipelineService } from '../../backend/src/services/telemetryPipeline.service.js';
import { closePool } from '../../backend/src/db/connection.js';
const event = { id: 'phase23m-restart-span', sourceRefId: 'phase23m-restart-span', sourceSystem: 'phase23m', traceId: 'phase23m-restart-trace', spanId: 'phase23m-restart-span', serviceId: 'payment-service', timestamp: new Date().toISOString(), durationMs: 125, status: 'OK' };
const args = { tenantId: 'phase23m-durable', environment: 'staging', provider: 'opentelemetry', telemetryType: 'trace', events: [event] };
const first = await telemetryPipelineService.normalizeAndRouteTelemetry(args);
const repeated = await telemetryPipelineService.normalizeAndRouteTelemetry(args);
console.log(JSON.stringify({ pid: process.pid, first, repeated }));
await closePool();
