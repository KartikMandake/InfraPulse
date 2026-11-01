import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
const p=path.join(root,'tests/cloud-lifecycle/governedRemediationIntelligence.test.js');let s=fs.readFileSync(p,'utf8');
if(!s.includes('function tenantTest')){
 s="import {withTenant} from '../../backend/src/security/tenantContext.js';\n"+s;
 s=s.replaceAll('payment-service','test-23j-payment-service');
 s=s.replaceAll("  test('","  tenantTest('");
 s=s.replace("    // Ensure clean state for test tenant","    await query(\"DELETE FROM incidents WHERE id LIKE 'INC-23J-%'\");\n    await query(\"INSERT INTO services(id,name,tenant_id) VALUES('test-23j-payment-service','test-23j-payment-service',$1) ON CONFLICT(id) DO NOTHING\",[TEST_TENANT_1]);\n    // Ensure clean state for test tenant");
 s=s.replace("      planHash: 'hash-two-person-001',","      planHash: plan.plan_hash,");
 s+='\nfunction tenantTest(name,callback){return test(name,()=>withTenant(TEST_TENANT_1,callback));}\n';
 fs.writeFileSync(p,s);
}
console.log('Aligned governed fixtures with authenticated tenant ownership and canonical plan hashes');
