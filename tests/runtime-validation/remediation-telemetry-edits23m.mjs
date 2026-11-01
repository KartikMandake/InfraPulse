import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
function edit(p,fn){p=path.join(root,p);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('backend/src/controllers/integrations.controller.js',s=>{
 const start=s.indexOf('  // === OTLP Ingestion Handlers ===');if(start<0)throw Error('Missing OTLP section');
 s=s.slice(0,start)+`  handleOtlpMetrics(req,res,next){return ingestOtlp(req,res,next,'metric');},
  handleOtlpTraces(req,res,next){return ingestOtlp(req,res,next,'trace');},
  handleOtlpLogs(req,res,next){return ingestOtlp(req,res,next,'log');}
};
async function ingestOtlp(req,res,next,type){
 try{
  const identity=await otlpIdentity(req);
  return await inIngestionTenant(identity,async()=>{
   const provider=integrationRegistry.get('opentelemetry');
   let events;try{events=provider[type==='metric'?'normalizeMetricPayload':type==='trace'?'normalizeTracePayload':'normalizeLogPayload'](req.body);}catch(e){throw ApiError.badRequest(e.message);}
   const environment=identity.environment||identity.config?.environment||'staging';
   events=events.map(event=>({...event,environment,tenantId:identity.tenant_id}));
   const data=await telemetryPipelineService.normalizeAndRouteTelemetry({integrationId:identity.id,tenantId:identity.tenant_id,environment,provider:'opentelemetry',telemetryType:type,events,rawBytes:Buffer.byteLength(req.rawBody||'')});
   res.status(data.rejectedCount&&data.processedCount===0?422:200).json({success:data.rejectedCount===0,ingestedCount:data.processedCount,duplicateCount:data.duplicateCount,data});
  });
 }catch(e){next(e);}
}
`;
 return "import {otlpIdentity,inIngestionTenant} from '../security/ingestionIdentity.js';\n"+s;
});
edit('backend/src/services/telemetryPipeline.service.js',s=>{
 s="import {query,withTransaction} from '../db/connection.js';\n"+s;
 const mapStart=s.indexOf('// Deduplication sliding cache');const mapEnd=s.indexOf('function validateEventTimestamp');s=s.slice(0,mapStart)+s.slice(mapEnd);
 const start=s.indexOf('        // Deduplication Check');const end=s.indexOf('        summary.processedCount++;',start)+'        summary.processedCount++;'.length;
 if(start<0||end<start)throw Error('Missing telemetry processing block');
 s=s.slice(0,start)+`        const dedupId=String(rawEv.sourceRefId||rawEv.id||crypto.createHash('sha256').update(JSON.stringify(rawEv)).digest('hex'));
        const result=await withTransaction(async()=>{
          const claim=await query('INSERT INTO telemetry_deduplication(tenant_id,environment,provider,telemetry_type,event_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_key',[tenantId,environment,provider,telemetryType,dedupId]);
          if(!claim.rowCount)return {duplicate:true};
          const mappedServiceId=serviceMappingService.resolveServiceIdentity({serviceName:rawEv.serviceId||rawEv.serviceName||rawEv.service,environment,k8sLabels:rawEv.normalizedAttributes?.resourceAttributes||rawEv.labels||{},composeService:rawEv.composeService||rawEv.normalizedAttributes?.composeService,resourceId:rawEv.resourceId||rawEv.sourceRefId});
          const canonicalEv={...rawEv,tenantId,organizationId,environment,serviceId:mappedServiceId,serviceName:mappedServiceId,eventTimestamp:tsValidation.timestamp};
          const saved=await ingestEvent(canonicalEv,{tenantId});
          if(!saved.success)throw new Error(saved.error);
          let alertTriggers=0;
          if(telemetryType==='metric'){
            await this._updateServiceFromMetric(canonicalEv);
            const alertRes=await evaluateAndCorrelateAlerts({mode:'simulated',useDatabase:true,tenantId});
            alertTriggers=alertRes.rulesTriggered||0;
          }
          return {event:{...canonicalEv,id:saved.event.id},alertTriggers};
        });
        if(result.duplicate){summary.duplicateCount++;continue;}
        summary.ingestedEvents.push(result.event);summary.alertTriggers+=result.alertTriggers||0;
        if(telemetryType==='metric')metricsCount++;else if(telemetryType==='trace')tracesCount++;else logsCount++;
        summary.processedCount++;`+s.slice(end);
 s=s.replace("if (telemetryType === 'trace' && sortedEvents.length > 0)","if (telemetryType === 'trace' && summary.ingestedEvents.length > 0)").replace('inferDependenciesFromTraces(sortedEvents, tenantId, environment)','inferDependenciesFromTraces(summary.ingestedEvents, tenantId, environment)');
 const evalStart=s.indexOf('    // 4. Trigger alert evaluation');const evalEnd=s.indexOf('    const processingLatencyMs',evalStart);s=s.slice(0,evalStart)+s.slice(evalEnd);
 return s.replace("if (value > 0.15) updates.status = 'failing';\n        else if (value > 0.05) updates.status = 'degraded';\n        else updates.status = 'healthy';","if (value > 2) updates.status = 'critical';\n        else if (value > 1) updates.status = 'degraded';\n        else updates.status = 'nominal';");
});
edit('backend/src/integrations/providers/opentelemetry/OpenTelemetryProvider.js',s=>{
 s="import crypto from 'node:crypto';\n"+s;
 s=s.replaceAll("resourceAttrs['deployment.environment'] || 'staging'","resourceAttrs['deployment.environment.name'] || resourceAttrs['deployment.environment'] || 'staging'");
 s=s.replace("sourceRefId: `metric-${metric.name}-${Date.now()}`","sourceRefId: 'metric-'+crypto.createHash('sha256').update(JSON.stringify([resourceAttrs,metric.name,dp])).digest('hex').slice(0,56)");
 s=s.replace("sourceRefId: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`","sourceRefId: 'log-'+crypto.createHash('sha256').update(JSON.stringify([resourceAttrs,log])).digest('hex').slice(0,56)");
 s=s.replace('return true;\n    }\n\n    const authHeader','return false;\n    }\n\n    const authHeader');
 return s.replace("const hasError = span.status?.code === 2 || span.status?.message || durationMs > 300;","const hasError = span.status?.code === 2;");
});
console.log('Connected authenticated OTLP to transactional tenant-scoped telemetry pipeline');
