import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
function edit(p,fn){p=path.join(root,p);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('backend/src/integrations/core/ssrfProtection.js',()=>"export {validateEndpointUrl,secureLookup,checkAddress} from '../../security/endpointPolicy.js';\n");
edit('backend/src/services/slo.service.js',s=>{
 s="import {query} from '../db/connection.js';\nimport {observationCounts,evaluateBurnWindows} from '../engine/sloWindows.js';\n"+s;
 s=s.replace('const now = new Date();','const now = options.now ? new Date(options.now) : new Date();');
 const start=s.indexOf('  // Fetch service telemetry metrics',s.indexOf('export async function evaluateSlo'));
 const end=s.indexOf('  // 1. Calculate SLI Value',start);if(start<0||end<start)throw Error('Missing SLO measurement block');
 s=s.slice(0,start)+`  const environment=options.environment||slo.sliDefinition?.environment||'staging';
  let samples=options.observations;
  if(!samples){const result=await query("SELECT event_timestamp,normalized_attributes FROM normalized_events WHERE service_id=$1 AND environment=$2 AND event_type='trace_anomaly' AND telemetry_mode='live' AND event_timestamp>$3 AND event_timestamp<=$4",[slo.serviceId,environment,windowStart.toISOString(),now.toISOString()]);samples=result.rows.map(row=>({timestamp:row.event_timestamp,...row.normalized_attributes}));}
  const measured=observationCounts(samples,{now,hours:windowDays*24,sliType:slo.sliType,latencyThresholdMs:slo.latencyThresholdMs});
  let totalEvents=options.totalEvents??measured.totalEvents;
  let badEvents=options.badEvents??measured.badEvents;
  let goodEvents=options.goodEvents??(totalEvents-badEvents);
  if(![totalEvents,badEvents,goodEvents].every(n=>Number.isFinite(n)&&n>=0)||goodEvents+badEvents!==totalEvents)throw ApiError.badRequest('SLI counts must be non-negative and good + bad must equal total.');
  const isSimulated=options.totalEvents!==undefined||options.observations!==undefined;
  const windows=evaluateBurnWindows(samples,{now,targetPercent:slo.targetPercent,sliType:slo.sliType,latencyThresholdMs:slo.latencyThresholdMs});
  const dataQuality=totalEvents===0?DATA_QUALITIES.MISSING_TELEMETRY:options.complete===true?DATA_QUALITIES.GOOD:DATA_QUALITIES.INCOMPLETE;
`+s.slice(end);
 const burnStart=s.indexOf('  // 3. Multi-window Burn Rates');const burnEnd=s.indexOf('  // 4. Persist Evaluation',burnStart);
 s=s.slice(0,burnStart)+"  const burnRate1h=windows['1h'].burnRate,burnRate6h=windows['6h'].burnRate,burnRate24h=windows['24h'].burnRate;\n"+s.slice(burnEnd);
 s=s.replace('dataQuality: options.dataQuality || budgetResult.dataQuality,','dataQuality: options.dataQuality || dataQuality,').replace("telemetrySource: 'demo_adapter'","telemetrySource: isSimulated?'explicit_test_observations':'sampled_trace_observations',\n    windowEvidence:windows");
 return s;
});
edit('backend/src/services/sre-intelligence/sloBudget.service.js',s=>s.replace('burnRate1h: burnRate,\n        burnRate6h: burnRate * 0.7,','burnRate1h: null,\n        burnRate6h: null,'));
edit('backend/src/services/investigation.service.js',s=>{
 s=s.replace("import { withTransaction } from '../db/connection.js';","import { withTransaction,query } from '../db/connection.js';");
 s=s.replace('  const logs = options.logs || getTelemetryLogs();\n  const traces = options.traces || getTelemetryTraces();',`  const events=tenantContext()?(await query("SELECT * FROM normalized_events WHERE service_id=ANY($1) AND event_timestamp>NOW()-INTERVAL '2 hours'",[services.map(s=>s.id)])).rows:[];
  const logs=options.logs||(tenantContext()?events.filter(e=>e.event_type==='log_error').map(e=>({id:e.id,serviceId:e.service_id,service:e.service_id,level:e.severity==='high'||e.severity==='critical'?'ERROR':'INFO',message:e.summary,timestamp:e.event_timestamp})):getTelemetryLogs());
  const traces=options.traces||(tenantContext()?events.filter(e=>e.event_type==='trace_anomaly').map(e=>({id:e.id,serviceId:e.service_id,service:e.service_id,...e.normalized_attributes,status:e.normalized_attributes?.isError?'error':'ok',timestamp:e.event_timestamp})):getTelemetryTraces());`);
 return s;
});
edit('backend/src/services/serviceMapping.service.js',s=>{
 s=s.replace('    const relationships = [];\n    // Map spans','    const relationships = [];\n    const traceIds=[...new Set(traces.map(t=>t.traceId||t.normalizedAttributes?.traceId).filter(Boolean))];\n    if(traceIds.length){const stored=await query("SELECT service_id,normalized_attributes FROM normalized_events WHERE tenant_id=$1 AND environment=$2 AND normalized_attributes->>\'traceId\'=ANY($3) AND event_timestamp>NOW()-INTERVAL \'2 hours\'",[tenantId,environment,traceIds]);traces=[...stored.rows.map(r=>({serviceId:r.service_id,...r.normalized_attributes})),...traces];}\n    // Map spans');
 s=s.replace('spanMap.set(spanId, { service, parentSpanId: t.parentSpanId || t.normalizedAttributes?.parentSpanId });','spanMap.set((t.traceId||t.normalizedAttributes?.traceId||\'unknown\')+\':\'+spanId, { service, parentSpanId: (t.traceId||t.normalizedAttributes?.traceId||\'unknown\')+\':\'+(t.parentSpanId || t.normalizedAttributes?.parentSpanId) });');
 return s;
});
edit('backend/src/services/sre-intelligence/infrastructureHealth.service.js',s=>{
 const start=s.indexOf('      // Query recent telemetry metrics');const end=s.indexOf('    ]);',start);
 s=s.slice(0,start)+`      query("SELECT id,service_id AS \\"serviceId\\",event_timestamp AS timestamp,normalized_attributes AS metrics FROM normalized_events WHERE tenant_id=$1 AND environment=$2 AND telemetry_mode='live' ORDER BY event_timestamp DESC LIMIT 1000",[tenantId,environment]).then(r=>r.rows)
` .replaceAll('\\"','"')+s.slice(end);
 s=s.replace("evt.eventTimestamp || evt.timestamp || evt.created_at","evt.eventTimestamp || evt.timestamp || evt.last_ingested_at");
 s=s.replace("if (globalFreshnessSeconds > STALE_THRESHOLD_SECONDS)","if (globalFreshnessSeconds > UNAVAILABLE_THRESHOLD_SECONDS) {globalTelemetryStatus='UNAVAILABLE';globalConfidence='LOW';}\n      else if (globalFreshnessSeconds > STALE_THRESHOLD_SECONDS)");
 s=s.replace("      // Incidents impact",`      if(svcTelemetry.length){const age=(evaluatedAt.getTime()-new Date(svcTelemetry[0].timestamp||svcTelemetry[0].eventTimestamp).getTime())/1000;if(!Number.isFinite(age)||age>UNAVAILABLE_THRESHOLD_SECONDS){svcTelemetryStatus='UNAVAILABLE';svcConfidence='LOW';}else if(age>STALE_THRESHOLD_SECONDS){svcTelemetryStatus='STALE';svcConfidence='MEDIUM';}}
      // Incidents impact`);
 s=s.replace('    // Telemetry gap penalty on global score if no data at all',`    const entities=[...resourcesHealth,...servicesHealth];
    const missing=entities.filter(e=>e.telemetryStatus==='UNAVAILABLE').length;
    if(entities.length&&missing===entities.length){globalTelemetryStatus='UNAVAILABLE';globalConfidence='LOW';}
    else if(missing){globalConfidence='LOW';}
    // Telemetry gap penalty on global score if no data at all`);
 return s;
});
console.log('Applied real SLO windows, observed health and canonical drift/security corrections');
