// Trusted IPC belongs solely to this local test child, never to the application.
const {config}=await import('../../backend/src/config/env.js');
for(const field of ['awsLifecycleMutationsEnabled','dockerLifecycleEnabled','kubernetesLifecycleEnabled','remediationExecutionEnabled','remediationProductionEnabled'])Object.defineProperty(config,field,{get:()=>false,set:value=>{if(value!==false)throw Error('Mutation flags cannot be enabled in Phase 24');}});
process.on('message',message=>{if(message==='phase24-owned-child-shutdown')process.emit('SIGTERM');});
await import('../../backend/src/entrypoint.js');
