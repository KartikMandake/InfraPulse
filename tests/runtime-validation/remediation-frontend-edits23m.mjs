import fs from 'node:fs';import path from 'node:path';import {root} from './remediation23m.mjs';
function edit(p,fn){p=path.join(root,p);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('frontend/src/pages/IntegrationsPage.jsx',s=>{
 s="import {parseIntegrationDraft} from '../utils/operatorFeedback.js';\n"+s;
 s=s.replace('  // Webhook deliveries modal',"  const [configDraft,setConfigDraft]=useState('{}');\n  const [credentialsDraft,setCredentialsDraft]=useState('{}');\n  // Webhook deliveries modal");
 s=s.replace('    setIsConfigureModalOpen(true);',"    setConfigDraft(JSON.stringify(existing?.config||getDefaultConfigForProvider(provider.key),null,2));\n    setCredentialsDraft(JSON.stringify(existing?{}:getDefaultCredentialsForProvider(provider.key),null,2));\n    setIsConfigureModalOpen(true);");
 s=s.replace('      if (configForm.id) {','      const parsed=parseIntegrationDraft(configDraft,credentialsDraft);\n      const submitted={...configForm,...parsed};\n      if (configForm.id) {');
 const saveStart=s.indexOf('  const handleSaveConfiguration');const saveEnd=s.indexOf('\n  const ',saveStart+10);const part=s.slice(saveStart,saveEnd).replaceAll('configForm.config','submitted.config').replaceAll('configForm.credentials','submitted.credentials');s=s.slice(0,saveStart)+part+s.slice(saveEnd);
 s=s.replace('value={JSON.stringify(configForm.config, null, 2)}', 'value={configDraft}').replace('value={JSON.stringify(configForm.credentials, null, 2)}','value={credentialsDraft}');
 s=s.replace(/onChange=\{\(e\) => \{\s*try \{\s*setConfigForm\(\{ \.\.\.configForm, config: JSON\.parse\(e\.target\.value\) \}\);\s*\} catch \(err\) \{\s*\/\/ typing\s*\}\s*\}\}/,'onChange={(e)=>setConfigDraft(e.target.value)}');
 s=s.replace(/onChange=\{\(e\) => \{\s*try \{\s*setConfigForm\(\{ \.\.\.configForm, credentials: JSON\.parse\(e\.target\.value\) \}\);\s*\} catch \(err\) \{\s*\/\/ typing\s*\}\s*\}\}/,'onChange={(e)=>setCredentialsDraft(e.target.value)}');
 s=s.replace('className="flex items-center gap-2 border-b border-[#272a33] text-xs"','className="grid grid-cols-1 sm:grid-cols-3 md:flex gap-2 border-b border-[#272a33] text-xs"');
 s=s.replace('className="flex items-center gap-2">\n              <h1','className="flex flex-wrap items-center gap-2 min-w-0">\n              <h1');
 s=s.replace('configuredIntegrations.length}/6 Connected','configuredIntegrations.length}/{catalog.length} Connected');
 return s;
});
edit('frontend/src/components/layout/TopHeader.jsx',s=>s.replace('className="flex items-center gap-2 sm:gap-3"','className="flex min-w-0 items-center gap-1 sm:gap-3"').replace('className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"','className="max-w-[130px] sm:max-w-none bg-transparent text-white text-xs font-bold outline-none cursor-pointer"').replace('className="flex items-center gap-2 p-1 pl-2','className="flex shrink-0 items-center gap-1 p-1 sm:pl-2'));
edit('frontend/src/App.jsx',s=>{
 s=s.replace("import React from 'react';","import React,{lazy,Suspense} from 'react';");
 s=s.replace(/import \{ (\w+) \} from '(\.\/pages\/[^']+)';/g,(_,name,p)=>`const ${name}=lazy(()=>import('${p}').then(module=>({default:module.${name}})));`);
 return s.replace('          <Routes>','          <Suspense fallback={<div role="status" className="p-6 text-slate-300">Loading page…</div>}>\n          <Routes>').replace('          </Routes>','          </Routes>\n          </Suspense>');
});
edit('frontend/src/components/layout/SimulationNotice.jsx',s=>s.replace('REST API Connected (port 5000)','REST API Connected'));
edit('frontend/src/context/AuthContext.jsx',s=>{
 const start=s.indexOf('        // No active session in cookies, auto-login');const end=s.indexOf('      } finally {',start);if(start>=0)s=s.slice(0,start)+"        if(isMounted)setUser(null);\n"+s.slice(end);return s;
});
edit('frontend/package.json',s=>{const p=JSON.parse(s);p.scripts.start='vite';return JSON.stringify(p,null,2)+'\n';});
console.log('Applied frontend draft, navigation, error-state and lazy-loading fixes');
