import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { evidence, root, save, command } from './independent23m.mjs';
const read=n=>JSON.parse(fs.readFileSync(path.join(evidence,n),'utf8'));
const technical=read('technical.json'); const workflows=read('workflows.json');
for(const r of technical){
 console.log('\nTECH',r.name,r.error||'');
 if(r.name==='schema-and-original-database-readonly')console.log(JSON.stringify({original:r.original,originalError:r.originalError,migrations:r.schema.migrations.length,tables:r.schema.tables.length}));
 if(r.name==='concurrent-database-idempotency-and-resource-claims')console.log(JSON.stringify({distinct:r.distinct,same:r.same,active:r.active}));
 if(r.name==='deduplication-across-process-restarts')console.log(JSON.stringify({first:JSON.parse(r.first.stdout).first.processedCount,repeat:JSON.parse(r.first.stdout).repeated.duplicateCount,restart:JSON.parse(r.restart.stdout).first.processedCount,persisted:r.persisted}));
 if(r.name==='SSRF-policy-matrix'||r.name==='AWS-region-and-role-config-without-network')console.log(JSON.stringify(r));
 if(r.name==='API-latency-and-concurrent-requests')console.log(JSON.stringify({runs:r.raw.map(x=>({endpoint:x.endpoint,rep:x.repetition,p50:x.p50,p95:x.p95,rps:x.requestsPerSecond,errors:x.statuses.filter(s=>s!==200).length})),before:r.diagnosticsBefore.data.data.process.memoryMb,after:r.diagnosticsAfter.data.data.process.memoryMb}));
 if(r.name==='logical-backup-and-real-data-restore')console.log(JSON.stringify({dumpStatus:r.dump.status,dumpMs:r.dump.ms,restoreStatus:r.restore.status,restoreMs:r.restore.ms,allTablesMatch:r.allTablesMatch,tables:Object.keys(r.before).length,rows:Object.values(r.before).reduce((a,t)=>a+t.count,0),backupBytes:r.backupBytes}));
 if(r.name==='RCA-labeled-evaluation')console.log(r.command.stdout.slice(-1800),r.command.stderr);
}
for(const r of workflows){
 if(r.name==='workflow-A-integration-discovery')console.log('INTEGRATION',JSON.stringify({adminSync:r.adminSync.status,responderSync:r.responderSync.status,failedSync:r.failedSync,failedStatus:r.afterFailedSync.data?.data?.status,failedTest:r.failedTest.data,disabled:r.disabledSync.status,disabledSuccess:r.disabledSync.data?.data?.success,calls:r.fixtureCalls}));
 if(r.name==='workflow-B-public-OTLP-to-incident')console.log('OTLP',JSON.stringify({metric:r.metric,traces:r.traces,duplicate:r.duplicate,before:r.before,after:r.after,countsBefore:r.countsBefore,countsAfter:r.countsAfter,dependencies:r.dependencies,events:r.events}));
 if(r.name==='workflow-B-controlled-alert-and-investigation')console.log('ALERT',JSON.stringify({created:r.evaluation.data.report.incidentsCreated,linked:r.evaluation.data.report.incidentsLinked,alerts:r.evaluation.data.report.alertsCreated,investigation:r.investigation.status,timeline:r.timeline.status,correlation:r.correlation.status}));
 if(r.name==='workflow-C-controlled-RCA')console.log('RCA',JSON.stringify({ranked:r.ranked.map(x=>({id:x.candidateServiceId,score:x.score,confidence:x.confidenceLevel,role:x.causalRole})),symptom:r.symptomOnly.map(x=>({id:x.candidateServiceId,score:x.score,confidence:x.confidenceLevel,sufficientEvidence:x.sufficientEvidence}))}));
 if(r.name==='workflow-D-baseline-drift-preview')console.log('DRIFT',JSON.stringify({detection:r.detection.data,preview:r.preview?.data,resourceAfter:r.resourceAfter,mutationRequests:r.mutationRequests}));
 if(r.name==='workflow-F-SRE-intelligence')console.log('SRE',JSON.stringify({arithmetic:r.arithmetic,health:r.responses.health.data.data,capacity:r.responses['capacity-optimization'].data.data}).slice(0,4500));
}
const baseline=read('initial-file-hashes.json');const changed=[];
for(const f of baseline){const p=path.join(root,f.path);const hash=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;if(hash!==f.sha256)changed.push({path:f.path,before:f.sha256,after:hash});}
save('preservation-check.json',{changed,envFilesUnchanged:!changed.some(f=>['.env','backend\\.env'].includes(f.path)),git:command('git',['status','--short'])});console.log('CHANGED BASELINE FILES',changed.map(x=>x.path));
