import test from 'node:test';import assert from 'node:assert/strict';
import {parseIntegrationDraft,copyText} from '../src/utils/operatorFeedback.js';
test('M18 complete JSON object drafts parse at submit time',()=>{assert.deepEqual(parseIntegrationDraft('{"timeoutMs":0}','{}'),{config:{timeoutMs:0},credentials:{}});});
test('M18 incomplete JSON and non-object values are rejected clearly',()=>{for(const bad of ['{','null','[]','"text"'])assert.throws(()=>parseIntegrationDraft(bad,'{}'),/JSON/);});
test('M19 successful clipboard write is awaited',async()=>{let copied;assert.deepEqual(await copyText('report',{async writeText(value){copied=value;}}),{ok:true});assert.equal(copied,'report');});
test('M19 denied clipboard access is handled without an unhandled rejection',async()=>{const result=await copyText('report',{async writeText(){throw new Error('NotAllowedError');}});assert.equal(result.ok,false);assert.match(result.error,/denied/);});
test('M19 absent Clipboard API produces a recoverable error',async()=>{assert.equal((await copyText('report',{})).ok,false);});
