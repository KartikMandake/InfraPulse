import fs from 'node:fs';import assert from 'node:assert/strict';import {root} from './phase25.mjs';
function replace(file,from,to){const target=root+'/'+file;const text=fs.readFileSync(target,'utf8');assert.ok(text.includes(from),file+' exact edit context missing');fs.writeFileSync(target,text.replace(from,to));}
replace('scripts/release/prepare.mjs',"fs.writeFileSync(path.join(output,'RELEASE_NOTES.md'),notes);","fs.writeFileSync(path.join(output,'RELEASE_NOTES.md'),notes);fs.writeFileSync(path.join(output,'CHANGELOG.md'),notes);");
replace('scripts/release/prepare.mjs',"{kind:'release-candidate',version,commit,productionReady:false","{kind:'release-candidate',version,commit,simulated:Boolean(images.simulated),productionReady:false");
replace('scripts/release/plan.mjs','candidate=verifyManifest(directory),ci=','candidate=verifyCandidate(directory),ci=');
replace('scripts/release/plan.mjs','approval:process.env.PLAN_ACKNOWLEDGEMENT,backup,ci});','approval:process.env.PLAN_ACKNOWLEDGEMENT,backup,ci,simulation:process.argv.includes(\'--simulation\')});');
replace('scripts/release/version.mjs',"assert.equal(typeof value,'string');const match=","assert.equal(typeof value,'string');assert.ok(value.length<=100,'Release version exceeds supported tag length');const match=");
replace('scripts/release/version.mjs',"return {major:Number(match[1])","assert.ok(match.slice(1,4).every(x=>Number.isSafeInteger(Number(x))),'Version numbers exceed supported integer range');return {major:Number(match[1])");
replace('scripts/release/version.mjs',"if(an&&bn)return Number(ax[i])<Number(ay[i])?-1:1;","if(an&&bn)return BigInt(ax[i])<BigInt(ay[i])?-1:1;");
replace('tests/cicd/releaseAutomation.test.mjs',"assert.equal(validateVersions(dir),'2.4.0');","assert.equal(validateVersions(dir),validateVersions(root));");
replace('tests/runtime-validation/phase25-workflows.mjs',"const lock=JSON.parse", "if(fs.existsSync(root+'/.github/workflows/release.yml'))throw Error('One-off generator already applied; edit reviewed workflow sources directly.');const lock=JSON.parse");
console.log('Candidate/image identity, simulation labeling and version bounds strengthened.');
