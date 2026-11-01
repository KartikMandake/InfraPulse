import fs from 'node:fs';
import path from 'node:path';
import { root,state,env,evidence,command,save,api,login,client } from './independent23m.mjs';
const db=client();await db.connect();const results=[];
async function record(name,fn){try{results.push({name,...await fn()});}catch(e){results.push({name,error:e.message});}save('supplement.json',results);console.log(name,results.at(-1).error||'recorded');}
const admin=await login(), responder=await login('responder'),viewer=await login('viewer');
await record('CSRF-origin-prefix-and-cookie-session',async()=>{
 const plan=(await db.query('SELECT id FROM remediation_plans LIMIT 1')).rows[0];const endpoint=`/api/remediation/plans/${plan.id}/dry-run`;
 const cookie={Cookie:`infrapulse_session=${admin}`};
 return {missingOrigin:await api(endpoint,{method:'POST',headers:cookie,body:{}}),unrelatedOrigin:await api(endpoint,{method:'POST',headers:{...cookie,Origin:'https://untrusted.invalid'},body:{}}),prefixOrigin:await api(endpoint,{method:'POST',headers:{...cookie,Origin:'http://localhost:51730'},body:{}}),authenticatedMe:await api('/api/auth/me',{headers:cookie})};
});
await record('cross-tenant-event-collision',async()=>{
 const {ingestEvent}=await import('../../backend/src/services/eventNormalizer.service.js');
 const base={eventType:'log_error',id:'phase23m-tenant-collision',sourceSystem:'phase23m-collision',serviceId:'payment-service',level:'ERROR',timestamp:new Date().toISOString()};
 const tenantA=await ingestEvent({...base,tenantId:'phase23m-alpha',message:'Alpha private payload'},{tenantId:'phase23m-alpha'});
 const tenantB=await ingestEvent({...base,tenantId:'phase23m-beta',message:'Beta overwrites payload'},{tenantId:'phase23m-beta'});
 const rows=(await db.query("select id,tenant_id,summary,title from normalized_events where source_system='phase23m-collision'")).rows;
 return {tenantA,tenantB,rows,viewerArbitraryTenant:await api('/api/events?tenantId=phase23m-alpha',{token:viewer})};
});
await record('generated-remediation-risk-and-real-plan-guards',async()=>{
 const {cloudLifecycleRepository}=await import('../../backend/src/repositories/cloudLifecycle.repository.js');
 await cloudLifecycleRepository.upsertResource({id:'phase23m-payment-service-container',name:'phase23m-payment-service-container',provider:'docker',resource_type:'docker_container',environment:'staging',current_state:'crashed',metadata:{compose_service:'payment-service',container_name:'phase23m-payment-service-container',image:'phase23m/payments:v1',is_live_docker:false}});
 const incident=(await db.query("select id from incidents where service_id='payment-service' limit 1")).rows[0];
 await db.query("update incidents set rca_confidence_level='STRONG_HYPOTHESIS',rca_hypotheses=$2 where id=$1",[incident.id,JSON.stringify([{candidateServiceId:'payment-service',score:85,confidenceLevel:'STRONG_HYPOTHESIS',supportingEvidence:[{type:'controlled_synthetic_fixture',title:'Synthetic stopped application container, no provider mutation'}]}])]);
 const generation=await api(`/api/remediation/incidents/${incident.id}/recommendations`,{token:responder,method:'POST',body:{}});
 const rec=generation.data.data.recommendations[0];if(!rec)throw Error('No generated recommendation');
 const plan=(await db.query('select * from remediation_plans where id=$1',[rec.planId])).rows[0];
 const dryRun=await api(`/api/remediation/plans/${plan.id}/dry-run`,{token:responder,method:'POST',body:{}});
 const approval=await api(`/api/remediation/plans/${plan.id}/request-approval`,{token:responder,method:'POST',body:{}});const aid=approval.data.data.id;
 const self=await api(`/api/remediation/approvals/${aid}/approve`,{token:responder,method:'POST',body:{planHash:plan.plan_hash}});
 const badHash=await api(`/api/remediation/approvals/${aid}/approve`,{token:admin,method:'POST',body:{planHash:'tampered-phase23m'}});
 const approved=await api(`/api/remediation/approvals/${aid}/approve`,{token:admin,method:'POST',body:{planHash:plan.plan_hash}});
 const execution=await api(`/api/remediation/plans/${plan.id}/execute`,{token:admin,method:'POST',body:{explicitConfirmation:true}});
 await db.query("update infra_remediation_approvals set expires_at=NOW()-INTERVAL '1 minute' where id=$1",[aid]);
 const expired=await api(`/api/remediation/approvals/${aid}/approve`,{token:admin,method:'POST',body:{planHash:plan.plan_hash}});
 return {generation,plan,dryRun,approval,self,badHash,approved,execution,expired,executions:(await db.query('select count(*) from remediation_executions')).rows};
});
await record('real-SLO-service-window-calculation-and-freshness',async()=>{
 const {evaluateSlo}=await import('../../backend/src/services/slo.service.js');const slo=(await db.query('select id from slos limit 1')).rows[0];
 const evaluated=await evaluateSlo(slo.id,{totalEvents:10000,goodEvents:9950,badEvents:50});
 const {calculateLinearRegression}=await import('../../backend/src/services/sre-intelligence/predictiveRisk.service.js');
 const {infrastructureHealthService}=await import('../../backend/src/services/sre-intelligence/infrastructureHealth.service.js');
 const points=[0,1,2,3].map(i=>({time:Date.now()+i*3600000,value:40+i*10}));
 const health=[];for(const [label,ageSeconds] of [['fresh',10],['stale',600],['old',90000]]){health.push({label,result:await infrastructureHealthService.evaluateHealth({telemetryOverrides:{events:[{timestamp:new Date(Date.now()-ageSeconds*1000).toISOString()}],resources:[],services:[],incidents:[],driftEvents:[]},persistSnapshot:false})});}
 const unavailable=await infrastructureHealthService.evaluateHealth({telemetryOverrides:{events:[],resources:[],services:[],incidents:[],driftEvents:[]},persistSnapshot:false});
 return {sloId:slo.id,input:{totalEvents:10000,goodEvents:9950,badEvents:50},evaluated,regression:calculateLinearRegression(points),insufficientRegression:calculateLinearRegression(points.slice(0,1)),health,unavailable};
});
await record('repository-backup-and-restore-scripts',async()=>{
 const nativeEnv={...env,PATH:'C:/Program Files/PostgreSQL/16/bin;'+env.PATH};
 const folder=path.join(evidence,'script-backup');fs.mkdirSync(folder,{recursive:true});
 const backup=command('powershell.exe',['-NoProfile','-File','scripts/backup-db.ps1','-BackupDir',folder,'-DbName',state.database,'-DbHost','127.0.0.1','-DbPort',state.port,'-DbUser','postgres'],{env:nativeEnv});
 const archive=fs.readdirSync(folder).find(f=>f.endsWith('.sql'));if(!archive)return {backup,error:'No archive created'};
 if(!state.restoreDatabase.startsWith('infrapulse_23m_independent_'))throw Error('Unsafe restore target');
 const restore=command('powershell.exe',['-NoProfile','-File','scripts/restore-db.ps1','-BackupFile',path.join(folder,archive),'-DbName',state.restoreDatabase,'-DbHost','127.0.0.1','-DbPort',state.port,'-DbUser','postgres'],{env:nativeEnv});
 const restored=client(state.restoreDatabase);await restored.connect();const sentinel=(await restored.query('select * from phase23m_restore_sentinel')).rows;await restored.end();return {backup,restore,sentinel,archiveBytes:fs.statSync(path.join(folder,archive)).size};
});
await record('existing-API-benchmark',async()=>({result:command(process.execPath,[path.join(root,'tests/performance/api-load.js')],{env:{...env,TARGET_URL:'http://127.0.0.1:5010'}})}));
await db.end();const {closePool}=await import('../../backend/src/db/connection.js');await closePool();
