import {state} from './phase24.mjs';process.env.PGDATABASE=state.suiteDatabase;process.env.PGDATABASE_TEST=state.suiteDatabase;
const {config}=await import('../../backend/src/config/env.js');
for(const field of ['awsLifecycleMutationsEnabled','dockerLifecycleEnabled','kubernetesLifecycleEnabled','remediationExecutionEnabled','remediationProductionEnabled'])Object.defineProperty(config,field,{configurable:false,get:()=>false,set:value=>{if(value!==false)throw Error('Phase 24 forbids enabling '+field);}});
