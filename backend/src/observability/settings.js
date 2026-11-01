import fs from 'node:fs';

const number = (env,key,fallback,min,max) => {
  const value=Number(env[key]??fallback);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid ${key}.`);
  return value;
};
export function observationSettings(env=process.env){
  let token=env.SELF_MONITORING_METRICS_TOKEN||'';
  if(env.SELF_MONITORING_METRICS_TOKEN_FILE){if(token)throw new Error('Configure the monitoring token value or file, not both.');try{token=fs.readFileSync(env.SELF_MONITORING_METRICS_TOKEN_FILE,'utf8').replace(/\r?\n$/,'');}catch{throw new Error('Monitoring token file unavailable.');}}
  if(token&&token.length<32)throw new Error('Monitoring scrape token requires at least 32 characters.');
  const settings={enabled:env.SELF_MONITORING_ENABLED!=='false',tracing:env.SELF_MONITORING_TRACING_ENABLED==='true',probes:env.SELF_MONITORING_DEPENDENCY_PROBES_ENABLED==='true',alerts:env.SELF_MONITORING_ALERTS_ENABLED==='true',token,operators:(env.SELF_MONITORING_OPERATOR_IDS||'').split(',').map(x=>x.trim()).filter(Boolean),intervalMs:number(env,'SELF_MONITORING_INTERVAL_MS',15000,1000,60000),sampleRate:number(env,'SELF_MONITORING_TRACE_SAMPLE_RATE',0.05,0,1),cooldownMs:number(env,'SELF_MONITORING_ALERT_COOLDOWN_MS',900000,1000,86400000),heartbeatMaxMs:number(env,'SELF_MONITORING_HEARTBEAT_MAX_MS',120000,1000,3600000),queueLimit:number(env,'SELF_MONITORING_QUEUE_LIMIT',100,1,1000000),errorRate:number(env,'SELF_MONITORING_ERROR_RATE_PERCENT',5,0.1,100),latencyMs:number(env,'SELF_MONITORING_LATENCY_MS',500,1,120000),cpuPercent:number(env,'SELF_MONITORING_CPU_PERCENT',90,1,10000),heapPercent:number(env,'SELF_MONITORING_HEAP_PERCENT',85,1,100),minEvents:number(env,'SELF_MONITORING_MIN_EVENTS',50,1,1000000),instance:env.SELF_MONITORING_INSTANCE_ID||'standalone-worker',targetPercent:number(env,'SELF_MONITORING_SLO_TARGET_PERCENT',99.9,1,99.9999),otlpEndpoint:env.SELF_MONITORING_OTLP_ENDPOINT||'http://127.0.0.1:4318/v1/traces'};
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(settings.instance))throw new Error('Invalid monitoring instance ID.');
  return settings;
}
export function localTelemetryUrl(value){
  try{const url=new URL(value);if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash)return null;
    if(!['127.0.0.1','localhost','[::1]','otel-collector','prometheus','grafana','loki','tempo','frontend'].includes(url.hostname))return null;
    return url;
  }catch{return null;}
}
