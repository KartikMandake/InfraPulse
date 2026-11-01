import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
function edit(relative,transform){const p=path.join(root,relative);const before=fs.readFileSync(p,'utf8'),after=transform(before);if(before!==after)fs.writeFileSync(p,after);}
edit('backend/src/middleware/csrf.js',()=>"export {csrfProtection} from '../security/csrfPolicy.js';\n");
for(const name of ['remediationApproval','remediationExecution','remediationPolicy','remediationRecommendation'])edit(`backend/src/services/remediation/${name}.service.js`,s=>s.includes('governanceError')?s:"import {governanceError} from '../../utils/governanceError.js';\n"+s.replaceAll('throw new Error(','throw governanceError('));
for(const file of ['services/services.service.js','services/incidents.service.js','controllers/deployments.controller.js','controllers/alerts.controller.js','services/investigation.service.js'])edit('backend/src/'+file,s=>{
 if(s.includes('unsafe_getMem'))return s;
 const aliases=[...s.matchAll(/as ((?:get|update|create)Mem\w+)/g)].map(m=>m[1]);
 s=s.replace(/as ((?:get|update|create)Mem\w+)/g,'as unsafe_$1');
 s="import {tenantContext} from '../security/tenantContext.js';\n"+s;
 for(const alias of aliases)s+=`\nconst ${alias}=(...args)=>tenantContext()?${['getMemServices','getMemIncidents','getMemAlerts','getMemDeployments'].includes(alias)?'[]':'null'}:unsafe_${alias}(...args);\n`;
 s=s.replace(/catch \(err\) \{(\s+console\.warn\([^\n]*fallback)/gi,'catch (err) {\n    if(tenantContext())throw err;$1');
 if(file==='services/services.service.js'||file==='services/incidents.service.js')s=s.replace('if (data && data.length > 0) return data;','if (data && (data.length > 0 || tenantContext())) return data;');
 return s;
});
edit('backend/src/services/investigation.service.js',s=>{
 s=s.replaceAll('investigationCache.get(incidentId)','investigationCache.get(cacheKey(incidentId))').replaceAll('investigationCache.set(incidentId,','investigationCache.set(cacheKey(incidentId),').replaceAll('investigationCache.delete(incidentId)','investigationCache.delete(cacheKey(incidentId))');
 if(!s.includes('function cacheKey'))s+='\nfunction cacheKey(id){return (tenantContext()?.tenantId||"internal")+":"+id;}\n';
 return s;
});
edit('backend/src/services/alertRules.service.js',s=>{
 if(s.includes("import {tenantContext}"))return s;
 s="import {tenantContext} from '../security/tenantContext.js';\n"+s;
 s=s.replaceAll('if (rules && rules.length > 0) return rules;','if (rules && (rules.length > 0 || tenantContext())) return rules;');
 s=s.replaceAll('return alertRulesMem;','return tenantContext()?[]:alertRulesMem;').replace('return alertRulesMem.find(r => r.id === ruleId) || null;','return tenantContext()?null:alertRulesMem.find(r => r.id === ruleId) || null;');
 s=s.replace(/catch \(err\) \{/g,'catch (err) {\n    if(tenantContext())throw err;');
 return s;
});
edit('backend/src/services/deploymentHistory.service.js',s=>{
 if(s.includes("import {tenantContext}"))return s;
 return "import {tenantContext} from '../security/tenantContext.js';\n"+s.replace('if (allChanges.length === 0) {','if (allChanges.length === 0 && !tenantContext()) {').replace('} catch (err) {','} catch (err) {\n    if(tenantContext())throw err;');
});
console.log('Applied scoped governance/error/fallback corrections');
