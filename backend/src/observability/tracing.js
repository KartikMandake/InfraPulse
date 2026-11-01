import {context,trace,propagation,SpanStatusCode,SpanKind} from '@opentelemetry/api';
import {TracerProvider,BatchSpanProcessor,TraceIdRatioBasedSampler} from '@opentelemetry/sdk-trace';
import {AsyncLocalStorageContextManager} from '@opentelemetry/context-async-hooks';
import {W3CTraceContextPropagator,setGlobalErrorHandler} from '@opentelemetry/core';
import {resourceFromAttributes} from '@opentelemetry/resources';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {performance} from 'node:perf_hooks';
import {observationSettings,localTelemetryUrl} from './settings.js';
import {recordOperation,safeOperation,classifyError,traceErrors} from './metrics.js';
import {logContext} from './logContext.js';
let provider;
export function initializeTracing({exporter,role='api',sampleRate}={}){if(provider)return provider;const settings=observationSettings();if(!settings.tracing&&!exporter)return null;const url=localTelemetryUrl(settings.otlpEndpoint);if(!url)throw new Error('Self-monitoring OTLP requires an approved local collector URL.');
  setGlobalErrorHandler(()=>{try{traceErrors.inc();}catch{}});
  provider=new TracerProvider({resource:resourceFromAttributes({'service.name':role==='worker'?'infrapulse-worker':'infrapulse-backend','deployment.environment.name':process.env.APP_ENV||process.env.NODE_ENV||'development'}),sampler:new TraceIdRatioBasedSampler(sampleRate??settings.sampleRate),spanProcessors:[new BatchSpanProcessor({exporter:exporter||new OTLPTraceExporter({url:url.href,timeoutMillis:1000}),maxQueueSize:512,maxExportBatchSize:64,scheduledDelayMillis:1000,exportTimeoutMillis:1500})]});
  trace.setGlobalTracerProvider(provider);context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());propagation.setGlobalPropagator(new W3CTraceContextPropagator());return provider;
}
export function validTraceparent(value){return typeof value==='string'&&/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/.test(value)&&!/^00-0{32}-/.test(value)&&!/-0{16}-0[01]$/.test(value);}
export function extractParent(value){return validTraceparent(value)?propagation.extract(context.active(),{traceparent:value}):context.active();}
export function carrier(){const result={};propagation.inject(context.active(),result);return validTraceparent(result.traceparent)?{traceparent:result.traceparent}:{};}
export function observe(operation,fn,{parent,kind=SpanKind.INTERNAL,classifyResult}={}){const name=safeOperation(operation),started=performance.now();let span;try{span=trace.getTracer('infrapulse-self').startSpan(name,{kind},parent||context.active());}catch{traceErrors.inc();}
  let invoked=false;const finish=(failed,error)=>{try{recordOperation(name,performance.now()-started,failed);if(failed){span?.setStatus({code:SpanStatusCode.ERROR});span?.recordException({name:'OperationError',message:classifyError(error)});}span?.end();}catch{}};
  const execute=()=>{invoked=true;try{const result=fn();const complete=value=>{const failed=classifyResult?classifyResult(value):value?.success===false||value?.partialTransition===true;finish(Boolean(failed));return value;};if(result&&typeof result.then==='function')return result.then(complete,error=>{finish(true,error);throw error;});return complete(result);}catch(error){finish(true,error);throw error;}};
  try{return context.with(span?trace.setSpan(parent||context.active(),span):parent||context.active(),execute);}catch(error){if(invoked)throw error;return execute();}
}
export function instrumentMethod(object,method,operation,options){const original=object?.[method];if(typeof original!=='function'||original.selfObserved)return;function instrumented(...args){return observe(operation,()=>original.apply(this,args),options);}Object.defineProperty(instrumented,'selfObserved',{value:true});object[method]=instrumented;}
export function startHttpTrace(req,next){let span;try{span=trace.getTracer('infrapulse-self').startSpan('http.request',{kind:SpanKind.SERVER},extractParent(req.headers.traceparent));const ids=span.spanContext();if(ids.traceId&&!/^0+$/.test(ids.traceId)){req.traceId=ids.traceId;req.spanId=ids.spanId;}}catch{}
  const callback=()=>logContext.run({requestId:req.correlationId,operation:'http.request'},next);return {span,run:()=>context.with(span?trace.setSpan(extractParent(req.headers.traceparent),span):context.active(),callback)};
}
export async function shutdownTracing(){if(!provider)return;let timer;try{await Promise.race([provider.shutdown(),new Promise(resolve=>{timer=setTimeout(resolve,2500);timer.unref();})]);}catch{traceErrors.inc();}finally{clearTimeout(timer);provider=null;}}
