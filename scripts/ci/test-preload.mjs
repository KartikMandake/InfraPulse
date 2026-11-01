import {requireIsolatedDatabase,safeTestEnvironment} from './common.mjs';
Object.assign(process.env,safeTestEnvironment());requireIsolatedDatabase();
const {config}=await import('../../backend/src/config/env.js');for(const field of ['awsLifecycleMutationsEnabled','dockerLifecycleEnabled','kubernetesLifecycleEnabled','remediationExecutionEnabled','remediationProductionEnabled'])Object.defineProperty(config,field,{get:()=>false,set:value=>{if(value!==false)throw Error('CI policy prohibits enabling '+field);}});
