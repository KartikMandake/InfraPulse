import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
function edit(p,fn){p=path.join(root,p);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('backend/src/services/faultLab.service.js',s=>{
 s="import {tenantContext} from '../security/tenantContext.js';\n"+s;
 s=s.replaceAll('activeSimulations.set(simulationResult.simulationId,','activeSimulations.set(scopeKey(simulationResult.simulationId),').replaceAll('activeSimulations.set(simulationId,','activeSimulations.set(scopeKey(simulationId),');
 for(const method of ['get','has','delete'])s=s.replaceAll(`activeSimulations.${method}(simulationId)`,`activeSimulations.${method}(scopeKey(simulationId))`);
 return s+'\nfunction scopeKey(id){return (tenantContext()?.tenantId||"internal")+":"+id;}\n';
});
edit('backend/src/integrations/telemetry/telemetry.service.js',s=>{
 s="import {tenantContext} from '../../security/tenantContext.js';\nimport {query as databaseQuery} from '../../db/connection.js';\n"+s;
 s=s.replace("let currentMode =",'const tenantModes=new Map();\nlet currentMode =');
 s=s.replace('  return currentMode;','  return tenantContext()?tenantModes.get(tenantContext().tenantId)||config.telemetryMode:currentMode;');
 s=s.replace('  currentMode = mode;','  if(tenantContext()){tenantModes.set(tenantContext().tenantId,mode);return mode;}\n  currentMode = mode;');
 s=s.replace('export async function getStatus() {',"export async function getStatus() {\n  if(tenantContext())return {activeMode:getTelemetryMode(),source:'tenant_canonical_events'};");
 s=s.replace('export async function getMetrics(query) {',`export async function getMetrics(query) {
  if(tenantContext()){const {rows}=await databaseQuery("SELECT service_id,event_timestamp,normalized_attributes FROM normalized_events WHERE event_type='metric_anomaly' ORDER BY event_timestamp DESC LIMIT 1000");return {source:'tenant_canonical_events',query:query||'',resultType:'vector',result:rows.map(r=>({metric:{__name__:r.normalized_attributes.metric,service:r.service_id},value:[new Date(r.event_timestamp).getTime()/1000,String(r.normalized_attributes.currentValue)]}))};}`);
 s=s.replace('export async function getTraces(traceId, service) {',`export async function getTraces(traceId, service) {
  if(tenantContext()){const {rows}=await databaseQuery("SELECT id,service_id,event_timestamp,normalized_attributes FROM normalized_events WHERE event_type='trace_anomaly' AND ($1::text IS NULL OR service_id=$1) AND ($2::text IS NULL OR normalized_attributes->>'traceId'=$2) ORDER BY event_timestamp DESC LIMIT 1000",[service||null,traceId||null]);const traces=rows.map(r=>({id:r.id,service:r.service_id,...r.normalized_attributes,timestamp:r.event_timestamp}));return {source:'tenant_canonical_events',totalTraces:traces.length,traces};}`);
 s=s.replace('export async function getLogs(query, service) {',`export async function getLogs(query, service) {
  if(tenantContext()){const {rows}=await databaseQuery("SELECT id,service_id,event_timestamp,summary,severity,normalized_attributes FROM normalized_events WHERE event_type='log_error' AND ($1::text IS NULL OR service_id=$1) ORDER BY event_timestamp DESC LIMIT 1000",[service||null]);const logs=rows.map(r=>({id:r.id,service:r.service_id,serviceId:r.service_id,timestamp:r.event_timestamp,message:r.summary,level:r.normalized_attributes.logLevel||r.severity,...r.normalized_attributes}));return {source:'tenant_canonical_events',totalLogs:logs.length,logs};}`);
 return s;
});
edit('backend/src/controllers/change.controller.js',s=>{
 s="import {withTenant} from '../security/tenantContext.js';\n"+s;
 s=s.replace("const configuredSecret = process.env.DEPLOYMENT_WEBHOOK_SECRET || 'infrapulse-webhook-secret-token';","const configuredSecret = process.env.DEPLOYMENT_WEBHOOK_SECRET;");
 s=s.replace('    if (!providedToken || providedToken !== configuredSecret) {','    if (!configuredSecret || !providedToken || providedToken !== configuredSecret) {');
 s=s.replace('    // 2. Validate payload',`    if(!req.verifiedWebhookTenant){
      const tenant=process.env.DEPLOYMENT_WEBHOOK_TENANT_ID||'default_tenant';
      if(req.body.tenantId&&req.body.tenantId!==tenant)throw ApiError.forbidden('Webhook tenant does not match configured owner.');
      req.verifiedWebhookTenant=tenant;
      return withTenant(tenant,()=>handleDeploymentWebhook(req,res,next));
    }
    // 2. Validate payload`);
 return s;
});
console.log('Scoped telemetry, fault caches and deployment webhook identity');
