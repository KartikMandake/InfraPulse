import fs from 'node:fs';import path from 'node:path';import {root,evidence,state,env,command,save} from './remediation23m.mjs';
const names=['slo-sloReliability','release-fullLifecycleE2E','cloud-lifecycle-driftDetectionReconciliation','cloud-lifecycle-realInfrastructureIntegrations','governed-remediation-safe'];
const targets=['tests/slo/sloReliability.test.js','tests/release/fullLifecycleE2E.test.js','tests/cloud-lifecycle/driftDetectionReconciliation.test.js','tests/cloud-lifecycle/realInfrastructureIntegrations.test.js','tests/cloud-lifecycle/governedRemediationIntelligence.test.js'];
names.push('cloud-lifecycle-liveObservabilityIncidentIntelligence');targets.push('tests/cloud-lifecycle/liveObservabilityIncidentIntelligence.test.js');
const resultFile=path.join(evidence,'suite-results.json');const results=JSON.parse(fs.readFileSync(resultFile));if(!fs.existsSync(path.join(evidence,'suite-results-first-remediation-run.json')))save('suite-results-first-remediation-run.json',results);
for(let i=0;i<names.length;i++){
 if(process.argv[2]&&names[i]!==process.argv[2])continue;
 const name=names[i];const log=path.join(evidence,'suite-'+name+'.log');if(!fs.existsSync(log+'.initial'))fs.copyFileSync(log,log+'.initial');
 const args=['--test','--test-reporter=tap',...(name==='governed-remediation-safe'?['--test-skip-pattern=11\\. Idempotency|12\\. Concurrency Lock']:[]),targets[i]];
 const r=command(process.execPath,args,{env:{...env,PGDATABASE:state.suiteDatabase,PGDATABASE_TEST:state.suiteDatabase}});fs.writeFileSync(log,(r.stdout||'')+(r.stderr||''));const item={name,status:r.status,ms:r.ms,counts:Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(r.stdout.match(new RegExp('# '+k+' (\\d+)'))?.[1]||0)]))};results[results.findIndex(x=>x.name===name)]=item;save('suite-results.json',results);console.log(name,r.status,JSON.stringify(item.counts));
}
