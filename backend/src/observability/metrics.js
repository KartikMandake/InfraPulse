import client from '@prometheus-io/client';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import v8 from 'node:v8';

export const registry=new client.Registry();
const metric=(Type,name,help,labelNames=[],buckets)=>new Type({name:'infrapulse_'+name,help,labelNames,registers:[registry],...(buckets?{buckets}:{})});
export const httpCount=metric(client.Counter,'http_requests_total','Completed application HTTP requests',['method','route','status_class']);
export const httpDuration=metric(client.Histogram,'http_request_duration_seconds','Application HTTP latency',['method','route'],[.001,.005,.01,.025,.05,.1,.25,.5,1,2.5,5,10,30]);
export const activeRequests=metric(client.Gauge,'http_active_requests','Active application requests');activeRequests.set(0);
export const operationCount=metric(client.Counter,'operations_total','Observed subsystem operations',['operation','outcome']);
export const operationDuration=metric(client.Histogram,'operation_duration_seconds','Subsystem operation duration',['operation'],[.001,.005,.01,.025,.05,.1,.25,.5,1,2.5,5,10,30]);
export const rankDistribution=metric(client.Histogram,'rca_candidate_rank','Ordinal ranks of emitted RCA candidates',[],[1,2,3,5,10,20,50]);
export const evidenceDistribution=metric(client.Counter,'rca_evidence_total','RCA evidence quality distribution',['quality']);
export const subsystemGauge=metric(client.Gauge,'dependency_state','Dependency state: 1 healthy, 0 unavailable/degraded, -1 unknown',['dependency']);
export const poolGauge=metric(client.Gauge,'database_pool_connections','Actual pool connection state',['state']);
export const queueGauge=metric(client.Gauge,'notification_queue_items','Actual notification queue state',['state']);
export const heartbeatAge=metric(client.Gauge,'worker_heartbeat_age_seconds','Age of the most recent standalone notification-worker heartbeat');
export const traceErrors=metric(client.Counter,'trace_export_errors_total','Trace export/instrumentation failures; no raw exception data');
const runtimeGauge=metric(client.Gauge,'process_measurement','Runtime measurements; bytes, percent of one CPU core, or seconds as named',['measurement']);
const lag=monitorEventLoopDelay({resolution:20});lag.enable();
const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
export const OPERATIONS=new Set(['db.query','db.transaction','rca.investigation','rca.graph','ai.request','cloud.discovery','cloud.lifecycle','cloud.provider','telemetry.ingest','notification.delivery','worker.batch','other']);
const ROUTES=['auth','services','incidents','investigation','alerts','alert-rules','deployments','telemetry','integrations','assistant','runbooks','runbook-executions','slos','reliability','changes','events','operations','cloud','remediation','sre-intelligence'];
export function routeLabel(path=''){const parts=path.split('/');if(parts[1]!=='api')return 'unmatched';return ROUTES.includes(parts[2])?'/api/'+parts[2]+'/*':'unmatched';}
export function isControlRequest(path=''){return path.startsWith('/internal/')||path.startsWith('/api/health')||path.startsWith('/api/self-monitoring');}
export const safeMethod=value=>METHODS.has(value)?value:'OTHER';
export const safeOperation=value=>OPERATIONS.has(value)?value:'other';
export const classifyError=error=>['ETIMEDOUT','ECONNREFUSED','ECONNRESET','ENOTFOUND','28P01','42501','23505'].includes(error?.code)?error.code:/timeout/i.test(error?.name||'')?'TIMEOUT':'OPERATION_FAILED';
const bounds=[1,5,10,25,50,100,250,500,1000,2500,5000,10000,30000,Infinity];
export class ObservationWindow{
  constructor({seconds=300,now=Date.now}={}){this.seconds=seconds;this.now=now;this.slots=new Array(seconds);this.startedAt=now();}
  record(operation,ms,failed=false){const second=Math.floor(this.now()/1000),index=((second%this.seconds)+this.seconds)%this.seconds;let slot=this.slots[index];if(!slot||slot.second!==second)slot=this.slots[index]={second,operations:{}};const key=operation==='http'?'http':safeOperation(operation);const data=slot.operations[key]??={total:0,failed:0,buckets:new Array(bounds.length).fill(0)};data.total++;data.failed+=failed?1:0;data.buckets[bounds.findIndex(x=>ms<=x)]++;}
  summary(operation='http'){const now=this.now(),second=Math.floor(now/1000);const data={total:0,failed:0,buckets:new Array(bounds.length).fill(0)};for(const slot of this.slots){if(!slot||slot.second<=second-this.seconds||slot.second>second)continue;const item=slot.operations[operation];if(item){data.total+=item.total;data.failed+=item.failed;item.buckets.forEach((count,i)=>data.buckets[i]+=count);}}
    const quantile=q=>{if(!data.total)return null;let n=0;for(let i=0;i<bounds.length;i++){n+=data.buckets[i];if(n>=Math.ceil(q*data.total))return Number.isFinite(bounds[i])?bounds[i]:null;}return null;};
    return {...data,windowSeconds:Math.min(this.seconds,Math.max(.001,(now-this.startedAt)/1000)),errorPercent:data.total?data.failed/data.total*100:null,p50Ms:quantile(.5),p95Ms:quantile(.95),p99Ms:quantile(.99),quantiles:'bucket upper bounds; null for absent/out-of-range data',scope:'process-local rolling window, reset on process restart'};
  }
}
export const window=new ObservationWindow();
let previousCpu=process.cpuUsage(),previousTime=performance.now();
export function processMeasurements(){const memory=process.memoryUsage(),heap=v8.getHeapStatistics(),now=performance.now(),cpu=process.cpuUsage(),elapsed=now-previousTime;const cpuPercent=elapsed>=1?(cpu.user-previousCpu.user+cpu.system-previousCpu.system)/elapsed/10:null;previousCpu=cpu;previousTime=now;
  const data={uptimeSeconds:process.uptime(),rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,heapLimitBytes:heap.heap_size_limit,heapUtilizationPercent:memory.heapUsed/heap.heap_size_limit*100,cpuPercentOfOneCore:cpuPercent,eventLoopP95Ms:Number.isFinite(lag.percentile(95))?lag.percentile(95)/1e6:null};lag.reset();
  for(const [name,value]of Object.entries(data))if(Number.isFinite(value))runtimeGauge.set({measurement:name},value);return data;
}
export function recordHttp(method,route,status,ms){try{httpCount.inc({method:safeMethod(method),route,status_class:status>=100&&status<600?Math.floor(status/100)+'xx':'other'});httpDuration.observe({method:safeMethod(method),route},ms/1000);window.record('http',ms,status>=500);}catch{}}
export function recordOperation(operation,ms,failed){try{const name=safeOperation(operation);operationCount.inc({operation:name,outcome:failed?'failure':'success'});operationDuration.observe({operation:name},ms/1000);window.record(name,ms,failed);}catch{}}
