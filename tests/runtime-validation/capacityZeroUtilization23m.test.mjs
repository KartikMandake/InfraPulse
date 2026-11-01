import './independent23m.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { capacityOptimizationService } from '../../backend/src/services/sre-intelligence/capacityOptimization.service.js';
const resource={id:'phase23m-zero-cpu',provider:'aws',resource_type:'ec2_instance',current_state:'running',cost_breakdown:{compute:0.1}};
test('Measured zero CPU and memory still produce an underutilization recommendation',async()=>{
 const result=await capacityOptimizationService.analyzeCapacityAndCost({resourceOverrides:[{...resource,metrics:{cpuPercent:0,memoryPercent:0}}],persist:false});
 assert.equal(result.insights.length,1,'Zero measurements are valid evidence of idle compute');
 assert.equal(result.insights[0].optimizationCategory,'OVER_PROVISIONED_COMPUTE');
 assert.equal(result.insights[0].actualUtilization.cpuPercent,0);
 assert.equal(result.insights[0].actualUtilization.memoryPercent,0);
 assert.ok(result.insights[0].estimatedMonthlyWasteUsd>0);
});
test('Missing utilization does not create an idle compute recommendation',async()=>{
 const result=await capacityOptimizationService.analyzeCapacityAndCost({resourceOverrides:[resource],persist:false});
 assert.equal(result.insights.length,0);
});
