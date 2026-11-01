const role=process.argv[2]||'server';
try{
  if(!['server','worker'].includes(role))throw new Error('Invalid application role.');
  const {validateEnvironment}=await import('./config/env.js');
  validateEnvironment();
  await import(role==='worker'?'./worker.js':'./server.js');
}catch(error){
  const safe=/^(Environment Configuration Error|Cannot read configured|Configure [A-Z_]+ or|Invalid application role)/.test(error.message)?error.message:'Application startup configuration failed.';
  process.stderr.write(JSON.stringify({timestamp:new Date().toISOString(),severity:'ERROR',service:'infrapulse-'+role,message:safe})+'\n');
  process.exitCode=1;
}
