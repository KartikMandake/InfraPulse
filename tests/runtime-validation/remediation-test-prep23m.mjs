import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
for(const file of ['awsEc2Lifecycle.test.js','cloudLifecycle.test.js','dockerKubernetesLifecycle.test.js']){
 const p=path.join(root,'tests/cloud-lifecycle',file);let s=fs.readFileSync(p,'utf8');s=s.replace(/(?<!await )lifecyclePolicy\.(setKillSwitch|getKillSwitchState)\(/g,'await lifecyclePolicy.$1(');fs.writeFileSync(p,s);
}
const p=path.join(root,'tests/cloud-lifecycle/governedRemediationIntelligence.test.js');let s=fs.readFileSync(p,'utf8');s=s.replace("planHash: 'hash-two-person-001',\n      tenantId:","planHash: plan.plan_hash,\n      tenantId:");fs.writeFileSync(p,s);
const suite=fs.readFileSync(path.join(root,'tests/runtime-validation/independent-suites23m.mjs'),'utf8').replaceAll('./independent23m.mjs','./remediation23m.mjs');fs.writeFileSync(path.join(root,'tests/runtime-validation/remediation-broad23m.mjs'),suite);
console.log('Updated async safety-state contracts and prepared full safe suite selection');
