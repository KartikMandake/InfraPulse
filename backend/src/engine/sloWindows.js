import {calculateBurnRate} from './sloEngine.js';
export function observationCounts(samples,{now=new Date(),hours,sliType='availability',latencyThresholdMs=150}={}){
  const end=new Date(now).getTime(),start=end-hours*3600000;
  const selected=samples.filter(sample=>{const time=new Date(sample.timestamp||sample.eventTimestamp||sample.event_timestamp).getTime();return Number.isFinite(time)&&time>start&&time<=end;});
  const badEvents=selected.filter(sample=>sliType==='latency'?Number(sample.durationMs)>latencyThresholdMs:sample.isError===true).length;
  return {windowStart:new Date(start).toISOString(),windowEnd:new Date(end).toISOString(),totalEvents:selected.length,badEvents,goodEvents:selected.length-badEvents};
}
export function evaluateBurnWindows(samples,options){return Object.fromEntries([1,6,24].map(hours=>{const counts=observationCounts(samples,{...options,hours});return [hours+'h',{...counts,burnRate:counts.totalEvents?calculateBurnRate({...counts,targetPercent:options.targetPercent}):null}];}));}
