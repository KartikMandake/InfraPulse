import fs from 'node:fs';
import path from 'node:path';
import {state,root,env,evidence,command,save,api,login,launch} from './independent23m.mjs';
const base=path.resolve('D:/Projects/.infrapulse-23m-independent');
if(base!=='D:\\Projects\\.infrapulse-23m-independent'||state.port!=='5541')throw Error('Unsafe cluster target');
const token=await login();
if(process.argv[2]!=='--restart-only'){
const before={ready:await api('/api/health/ready'),killSwitch:await api('/api/cloud/kill-switch',{token})};
const t=performance.now();const stop=command('C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe',['-D',base+'/pgdata','-m','fast','-w','stop'],{stdio:'ignore'});
const down={live:await api('/api/health/live'),ready:await api('/api/health/ready'),services:await api('/api/services'),authenticated:await api('/api/auth/me',{token})};
const start=command('C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe',['-D',base+'/pgdata','-l',base+'/postgres.log','-o','-p 5541 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c autovacuum=off','-w','-t','20','start'],{stdio:'ignore'});
const recovered=[];for(let i=0;i<3;i++)recovered.push({ready:await api('/api/health/ready'),services:await api('/api/services',{token})});
save('database-recovery.json',{before,stop,down,start,recovered,wholeDrillMs:performance.now()-t,limitation:'One controlled outage of this run-owned PostgreSQL cluster; not a WAL or production RTO/RPO drill.'});
}
// Restart only our own backend to load the narrow capacity fix and observe process-local safety state.
const currentPid=(await api('/api/health/live')).data.pid;
const launchedPid=JSON.parse(fs.readFileSync(path.join(evidence,'startup.json'),'utf8')).live.data.pid;
if(currentPid!==launchedPid)throw Error('Backend ownership cannot be established');
process.kill(currentPid);await new Promise(r=>setTimeout(r,300));
launch('backend',process.execPath,['src/server.js'],path.join(root,'backend'));
for(let i=0;i<40;i++){try{if((await api('/api/health/ready')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,200));}
save('backend-restart.json',{ready:await api('/api/health/ready'),sessionAfterRestart:await api('/api/auth/me',{token}),killSwitchAfterRestart:await api('/api/cloud/kill-switch',{token}),freezeReenabled:await api('/api/cloud/kill-switch',{token,method:'POST',body:{enabled:true,reason:'Phase 23M safety freeze after controlled restart'}})});
const testEnv={...env,PGDATABASE:state.suiteDatabase,PGDATABASE_TEST:state.suiteDatabase};
const regression=command(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1','tests/cloud-lifecycle/autonomousSreIntelligence.test.js','tests/cloud-lifecycle/enterpriseProductionHardening.test.js','tests/runtime-validation/capacityZeroUtilization23m.test.mjs'],{env:testEnv});save('post-fix-regressions.json',regression);console.log('Recovery recorded; focused regression exit:',regression.status);
