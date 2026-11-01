import { command,save } from './independent23m.mjs';
const operations=process.argv[3]==='operations';
const result=command(process.execPath,['--test','--test-reporter=tap',operations?'tests/runtime-validation/operationsRbac23m.test.mjs':'tests/runtime-validation/capacityZeroUtilization23m.test.mjs']);
save((operations?'operations':'capacity')+'-regression-'+(process.argv[2]==='before'?'before':'after')+'.json',result);
console.log(result.status,result.stdout,result.stderr);
