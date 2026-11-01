import fs from 'node:fs';import path from 'node:path';import {root,state,env,save,command} from './remediation23m.mjs';
const mode=process.argv[2];let result;
if(mode==='backend')result=command(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1','src/engine/__tests__/*.test.js','src/services/__tests__/*.test.js','src/integrations/telemetry/__tests__/*.test.js','src/db/__tests__/*.test.js'],{cwd:path.join(root,'backend'),env:{...env,PGDATABASE:state.suiteDatabase,PGDATABASE_TEST:state.suiteDatabase}});
else if(mode==='frontend')result=command(process.execPath,['--test','tests/*.test.mjs'],{cwd:path.join(root,'frontend')});
else if(mode==='build')result=command(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:path.join(root,'frontend'),env:{...env,NODE_ENV:'production'}});
else if(mode==='syntax'){
 const files=[];function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true})){if(x.name==='node_modules')continue;const p=path.join(dir,x.name);if(x.isDirectory())walk(p);else if(x.name.endsWith('.js'))files.push(p);}}walk(path.join(root,'backend/src'));
 const errors=[];for(const file of files){const r=command(process.execPath,['--check',file]);if(r.status!==0)errors.push({file,...r});}result={status:errors.length?1:0,files:files.length,errors};
}else throw Error('Specify backend, frontend, build or syntax');
save('check-'+mode+'.json',result);console.log(mode,result.status,result.stdout?.slice(-8000)||'',result.stderr?.slice(-1500)||'');
