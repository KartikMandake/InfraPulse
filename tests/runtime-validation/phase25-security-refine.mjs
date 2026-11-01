import fs from 'node:fs';import assert from 'node:assert/strict';import {root} from './phase25.mjs';
function replace(file,from,to){const target=root+'/'+file,text=fs.readFileSync(target,'utf8');assert.ok(text.includes(from));fs.writeFileSync(target,text.replace(from,to));}
replace('scripts/ci/common.mjs',"AI_PROVIDER:'mock',INTEGRATION", "AI_PROVIDER:'mock',DEBUG_SQL:'false',OPENAI_API_KEY:'',GEMINI_API_KEY:'',AWS_ROLE_ARN:'',AWS_WEB_IDENTITY_TOKEN_FILE:'',AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:'',AWS_CONTAINER_CREDENTIALS_FULL_URI:'',AWS_CONTAINER_AUTHORIZATION_TOKEN:'',AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE:'',INTEGRATION");
replace('scripts/release/plan.mjs',"candidate=verifyCandidate(directory),ci=", "candidate=verifyCandidate(directory),ci=");
replace('scripts/release/plan.mjs',"const plan=createPlan({", "if(process.env.RELEASE_VERSION)assert.equal(candidate.version,process.env.RELEASE_VERSION);if(process.env.RELEASE_COMMIT)assert.equal(candidate.commit,process.env.RELEASE_COMMIT);const plan=createPlan({");
console.log('Isolated provider credential paths cleared; requested version/commit bound to candidate.');
