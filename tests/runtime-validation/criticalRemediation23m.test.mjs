import './remediation23m.mjs';
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import app from '../../backend/src/app.js';import {api,login,client,command,root} from './remediation23m.mjs';
import {query,closePool,getPool,withTransaction} from '../../backend/src/db/connection.js';import {withTenant} from '../../backend/src/security/tenantContext.js';
import {ingestEvent} from '../../backend/src/services/eventNormalizer.service.js';
import {remediationRepository as repo} from '../../backend/src/repositories/remediation.repository.js';
import {remediationApprovalService} from '../../backend/src/services/remediation/remediationApproval.service.js';
import {assertPlanIntegrity} from '../../backend/src/security/planIntegrity.js';
import {lifecyclePolicy} from '../../backend/src/services/cloud-lifecycle/policies/lifecycle-policy.js';
import {generatePlanHash,assertRunbookPlanIntegrity} from '../../backend/src/services/remediationPolicy.service.js';
import * as incidentsRepo from '../../backend/src/repositories/incidents.repository.js';
import {remediationExecutionService} from '../../backend/src/services/remediation/remediationExecution.service.js';
const suffix=Date.now().toString(36),tenantA='tenant_a_'+suffix,tenantB='tenant_b_'+suffix;let server,base,tokenA,tokenB;
before(async()=>{
 for(const tenant of [tenantA,tenantB]){await query("INSERT INTO users(id,name,email,password_hash,role,tenant_id) SELECT $1,$1,$2,password_hash,'admin',$3 FROM users WHERE id='usr_admin_001'",['usr_'+tenant,tenant+'@test.invalid',tenant]);await query('INSERT INTO services(id,name,tenant_id) VALUES($1,$1,$2)',['svc_'+tenant,tenant]);}
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 const auth=async tenant=>{const r=await api('/api/auth/login',{base,method:'POST',body:{email:tenant+'@test.invalid',password:'Password123!'}});assert.equal(r.status,200);assert.equal(r.data.data.user.tenantId,tenant);return r.data.data.sessionToken;};tokenA=await auth(tenantA);tokenB=await auth(tenantB);
});
after(async()=>{await lifecyclePolicy.setKillSwitch(false);if(server)await new Promise(r=>server.close(r));await closePool();});
test('M01 anonymous API reads require login',async()=>{for(const p of ['/api/services','/api/incidents','/api/alerts','/api/deployments','/api/events','/api/integrations','/api/cloud/resources','/api/health/diagnostics'])assert.equal((await api(p,{base})).status,401,p);});
test('M01 trusted session tenant scopes list, IDs and query overrides',async()=>{
 const a=await api('/api/services',{base,token:tokenA});assert.equal(a.status,200);assert.deepEqual(a.data.data.map(x=>x.id),['svc_'+tenantA]);
 assert.equal((await api('/api/services/svc_'+tenantB,{base,token:tokenA})).status,404);
 assert.equal((await api('/api/services?tenantId='+tenantB,{base,token:tokenA})).status,403);
 const b=await api('/api/services',{base,token:tokenB});assert.deepEqual(b.data.data.map(x=>x.id),['svc_'+tenantB]);
});
test('M01 RLS covers legacy tables, raw queries, transactions and cross-tenant inserts',async()=>{
 const rows=await withTenant(tenantA,()=>query('SELECT id FROM services'));assert.deepEqual(rows.rows.map(x=>x.id),['svc_'+tenantA]);
 await assert.rejects(withTenant(tenantA,()=>query('INSERT INTO services(id,name,tenant_id) VALUES($1,$1,$2)',['malicious_'+suffix,tenantB])),e=>e.code==='42501');
 const auth=await query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity AND tablename NOT IN ('schema_migrations','cloud_emergency_state')");assert.deepEqual(auth.rows,[]);
 const unscoped=await query('SELECT count(*)::int n FROM services');assert.ok(unscoped.rows[0].n>1,'Transaction-local roles must reset without leaking into internal/bootstrap work');
});
test('M01 alert-rule updates cannot fall back to another tenant or global demo memory',async()=>{const created=await api('/api/alert-rules',{base,token:tokenA,method:'POST',body:{name:'Private rule '+suffix,severity:'warning',metric:'rps',operator:'>',threshold:10,targetServiceId:'svc_'+tenantA}});assert.equal(created.status,201);const id=created.data.data.id;for(const foreignId of [id,'RULE-ERR-01'])assert.equal((await api('/api/alert-rules/'+foreignId,{base,token:tokenB,method:'PATCH',body:{name:'Unauthorized override'}})).status,404);const own=await api('/api/alert-rules/'+id,{base,token:tokenA,method:'PATCH',body:{name:'Authorized change'}});assert.equal(own.status,200);assert.equal(own.data.data.name,'Authorized change');});
test('M01 signup creates isolated server-owned membership without seeded fallback records',async()=>{
 const signup=await api('/api/auth/register',{base,method:'POST',body:{name:'Isolation regression',email:'new_'+suffix+'@test.invalid',password:'Password123!',tenantId:'default_tenant',role:'admin'}});assert.equal(signup.status,201);const identity=signup.data.data;assert.notEqual(identity.user.tenantId,'default_tenant');assert.equal(identity.user.role,'viewer');
 const list=await api('/api/services',{base,token:identity.sessionToken});assert.deepEqual(list.data.data,[]);
 for(const route of ['/api/telemetry/logs','/api/telemetry/traces']){const result=await api(route,{base,token:identity.sessionToken});assert.equal(result.status,200);assert.ok(!JSON.stringify(result).includes('payment-service'));}
});
test('M01 incident timeline and cached investigations cannot expose another tenant or demo records',async()=>{
 const id='security_inc_'+suffix;await withTenant(tenantA,()=>incidentsRepo.createIncidentRecord({id,title:'Private tenant incident',serviceId:'svc_'+tenantA,serviceName:'Private service',status:'investigating',severity:'SEV-1',startedAt:'19:00:00 UTC'}));
 const own=await api(`/api/incidents/${id}/timeline`,{base,token:tokenA});assert.equal(own.status,200);assert.equal(own.data.data.primaryServiceId,'svc_'+tenantA);
 for(const route of [`/api/incidents/${id}/timeline`,`/api/incidents/${id}/investigation`,'/api/incidents/INC-4921/timeline'])assert.equal((await api(route,{base,token:tokenB})).status,404,route);
});
test('M02 same source identity stays independent across tenants and direct IDs',async()=>{
 const event={id:'shared_'+suffix,eventType:'log_error',sourceSystem:'security-test',message:'Alpha',timestamp:new Date().toISOString()};
 const a=await withTenant(tenantA,()=>ingestEvent({...event,tenantId:tenantB}));const b=await withTenant(tenantB,()=>ingestEvent({...event,message:'Beta'}));assert.equal(a.success,true);assert.equal(b.success,true);assert.notEqual(a.event.id,b.event.id);assert.equal(a.event.tenant_id,tenantA);
 assert.equal((await api('/api/events/'+b.event.id,{base,token:tokenA})).status,404);
 const list=await api('/api/events',{base,token:tokenA});assert.ok(list.data.data.every(x=>x.tenant_id===tenantA));
});
test('M03 canonical plan hash, required approval hash and immutable stored parameters',async()=>{
 const rec=await repo.createRecommendation({tenantId:'default_tenant',environment:'staging',serviceId:'payment-service',resourceId:'security-resource',detectedProblem:'Synthetic',proposedAction:'DOCKER_CONTAINER_START',expectedOutcome:'Preview only',riskLevel:'LOW'});
 const plan=await repo.createPlan({recommendationId:rec.id,action:'DOCKER_CONTAINER_START',targetResourceId:'security-resource',parameters:{containerName:'synthetic'}});assertPlanIntegrity(plan);
 assert.throws(()=>assertPlanIntegrity({...plan,parameters:{containerName:'different'}}),/Tampering/);
 for(const change of [{target_resource_id:'other'},{action:'DOCKER_CONTAINER_STOP'},{version:2},{provider:'aws'},{rollback_plan:{action:'different'}}])assert.throws(()=>assertPlanIntegrity({...plan,...change}),/Tampering/);
 const getPlan=repo.getPlanById;repo.getPlanById=async()=>({...plan,target_resource_id:'changed-target'});try{await assert.rejects(remediationExecutionService.executePlan({planId:plan.id,user:{role:'admin',email:'synthetic@test.invalid'}}),e=>e.statusCode===409&&/Tampering/.test(e.message));}finally{repo.getPlanById=getPlan;}
 await assert.rejects(query('UPDATE remediation_plans SET parameters=$2 WHERE id=$1',[plan.id,JSON.stringify({containerName:'different'})]),e=>e.code==='42501');
 const approval=await remediationApprovalService.requestApproval({planId:plan.id,user:{email:'requester@test.invalid',role:'responder'}});
 await assert.rejects(remediationApprovalService.approvePlan({approvalId:approval.id,user:{email:'approver@test.invalid',role:'admin'}}),/Tampering/);
 const valid=await remediationApprovalService.approvePlan({approvalId:approval.id,user:{email:'approver@test.invalid',role:'admin'},planHash:plan.plan_hash});assert.equal(valid.approval_status,'APPROVED');
 const stored=await repo.getApprovalById(approval.id);assert.equal(stored.approved_plan_hash,plan.plan_hash);
});
test('M03 diagnostic runbooks also reject changed plan contents',()=>{
 const plan={runbookId:'RB',runbookVersion:1,targetServiceId:'svc',steps:[{stepNumber:1,adapterAction:'inspect',parameters:{limit:5}}]};const execution={...plan,dryRunPlan:plan,planHash:generatePlanHash(plan)};assertRunbookPlanIntegrity(execution);
 assert.throws(()=>assertRunbookPlanIntegrity({...execution,dryRunPlan:{...plan,targetServiceId:'other'}}),/Security violation/);
});
test('M04 emergency switch persists and is shared with a fresh process',async()=>{
 await lifecyclePolicy.setKillSwitch(true,{user:{email:'safety@test.invalid'},reason:'Cross-process regression'});
 const code="import './tests/runtime-validation/remediation23m.mjs';const {lifecyclePolicy}=await import('./backend/src/services/cloud-lifecycle/policies/lifecycle-policy.js');console.log(JSON.stringify(await lifecyclePolicy.getKillSwitchState()));";
 const result=command(process.execPath,['--input-type=module','-e',code]);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).active,true);
 const policy=await lifecyclePolicy.evaluateActionPolicy({name:'synthetic',environment:'staging'},'restart');assert.equal(policy.allowed,false);
});
test('M04 absent durable switch state fails closed',async()=>{
 await query('ALTER TABLE cloud_emergency_state RENAME TO cloud_emergency_state_test');try{assert.equal((await lifecyclePolicy.getKillSwitchState()).active,true);}finally{await query('ALTER TABLE cloud_emergency_state_test RENAME TO cloud_emergency_state');}
});
test('M05 DB enforces resource exclusion for concurrent clients',async()=>{
 const run=async id=>{const db=client();await db.connect();try{return await db.query("INSERT INTO remediation_executions(id,resource_id,idempotency_key,executed_by,status) VALUES($1,$2,$1,'synthetic','EXECUTING')",[id,'race_'+suffix]);}finally{await db.end();}};
 const outcomes=await Promise.allSettled([run('racea_'+suffix),run('raceb_'+suffix)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'23505');
 await query('DELETE FROM remediation_executions WHERE resource_id=$1',['race_'+suffix]);
});
test('M11 CSRF rejects origin prefixes even with cookies and dummy Authorization',async()=>{
 const token=await login('admin',base);const r=await api('/api/cloud/kill-switch',{base,method:'POST',headers:{Cookie:'infrapulse_session='+token,Origin:'http://localhost:51730',Authorization:'Bearer ignored'},body:{enabled:false}});assert.equal(r.status,403);
});
test('M05 cloud lifecycle and remediation cannot execute the same resource concurrently',async()=>{
 const resource='cross_engine_'+suffix;await query("INSERT INTO cloud_resources(id,name,provider,resource_type) VALUES($1,$1,'docker','docker_container')",[resource]);
 const run=async sql=>{const db=client();await db.connect();try{return await db.query(sql,[resource]);}finally{await db.end();}};
 const outcomes=await Promise.allSettled([run("INSERT INTO cloud_lifecycle_operations(id,resource_id,action,status,requested_by) VALUES($1,$1,'start','executing','synthetic')"),run("INSERT INTO remediation_executions(id,resource_id,idempotency_key,executed_by,status) VALUES($1,$1,$1,'synthetic','EXECUTING')")]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'23505');await query('DELETE FROM cloud_lifecycle_operations WHERE resource_id=$1',[resource]);await query('DELETE FROM remediation_executions WHERE resource_id=$1',[resource]);await query('DELETE FROM cloud_resources WHERE id=$1',[resource]);
});
test('M25 database disconnect returns 503 with no fabricated service records',async()=>{const pool=getPool(),connect=pool.connect;pool.connect=function(callback){const error=Object.assign(new Error('Synthetic database connection failure'),{code:'ECONNREFUSED'});if(callback){queueMicrotask(()=>callback(error));return;}return Promise.reject(error);};try{const result=await api('/api/services',{base,token:tokenA});assert.equal(result.status,503);assert.equal(result.data.data,undefined);}finally{pool.connect=connect;}});
test('M25 swallowed SQL errors cannot be reported as a successful commit',async()=>{await assert.rejects(withTransaction(async()=>{try{await query('SELECT * FROM phase23m_missing_transaction_table');}catch{}return {success:true};}),/aborted before commit/);});
