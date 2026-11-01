import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { root, evidence, save, api, login } from './independent23m.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/karti/AppData/Local/npm-cache/_npx/83f51bd5dfda7e85/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/karti/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--disable-gpu','--disable-dev-shm-usage','--renderer-process-limit=1','--js-flags=--max-old-space-size=128']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(15000);
const events=[];page.on('pageerror',e=>events.push({type:'pageerror',text:e.message}));page.on('console',e=>{if(e.type()==='error')events.push({type:'console',text:e.text()});});page.on('response',r=>{if(r.url().includes('/api/'))events.push({type:'api',url:r.url(),status:r.status()});});
const token=await login();await context.addCookies([{name:'infrapulse_session',value:token,url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
const results=[];
async function click(pattern){const b=page.locator('main').getByRole('button',{name:pattern}).first();if(!await b.count())return {pattern:String(pattern),result:'NOT VERIFIED: control not found'};if(!await b.isEnabled())return {pattern:String(pattern),result:'disabled'};await b.click();await page.waitForTimeout(250);return {pattern:String(pattern),result:'clicked',url:page.url(),text:(await page.locator('main').innerText()).slice(-1800)};}
async function visit(route,fn){const from=events.length;try{await page.goto('http://127.0.0.1:5180'+route,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('main')?.innerText.length>100);await page.waitForTimeout(600);const actions=await fn();const body=await page.locator('main').innerText();results.push({route,actions,body:body.slice(0,16000),events:events.slice(from)});}catch(e){results.push({route,error:e.message,events:events.slice(from)});}save('browser-interactions.json',results);console.log(route,results.at(-1).error||'recorded');}
try {
 await visit('/',async()=>[await click(/^Inspect$/)]);
 await visit('/system-overview',async()=>[await click(/^Staging$/),await click(/^1h$/),await click(/Run Diagnostic/)]);
 await visit('/services',async()=>[await click(/Inventory/),await click(/^Critical/),await click(/Graph/)]);
 const services=(await api('/api/services',{token})).data.data;const incidents=(await api('/api/incidents',{token})).data.data;
 await visit('/services/'+services[0].id,async()=>[await click(/Pod Instances/),await click(/Linked Alerts/),await click(/Dependencies/),await click(/Endpoints/)]);
 await visit('/incidents',async()=>[await click(/^SEV-2$/),await click(/^all$/),await click(/^Investigate$/)]);
 await visit('/incidents/'+incidents[0].id,async()=>[await click(/Inspect Evidence/),await click(/deployment change/),await click(/Why is this service ranked first/)]);
 await visit('/alerts',async()=>{const selects=page.locator('main select');const actions=[];for(let i=0;i<await selects.count();i++){const values=await selects.nth(i).locator('option').evaluateAll(n=>n.map(x=>x.value));if(values.length>1){await selects.nth(i).selectOption(values[1]);actions.push({filter:i,value:values[1]});await selects.nth(i).selectOption(values[0]);}}actions.push(await click(/^Acknowledge$/));return actions;});
 await visit('/telemetry',async()=>[await click(/Structured Logs/),await click(/Time-Series Metrics/),await click(/Distributed Traces/),await click(/Run Query/)]);
 await visit('/deployments',async()=>[await click(/Pre-Deployment Risk Assessor/),await click(/Dependency Blast Radius/),await click(/Post-Deployment Regressions/),await click(/Historical Change Intelligence/)]);
 await visit('/slos',async()=>[await click(/^Evaluate$/),await click(/Define SLO/)]);
 await visit('/runbooks',async()=>[await click(/Generate Dry-Run Execution Plan/),await click(/Dry-Run & Approval/),await click(/Execution Progress/)]);
 await visit('/fault-injection',async()=>{const select=page.locator('main select').first();const opts=await select.locator('option').evaluateAll(n=>n.map(x=>x.value));await select.selectOption(opts.at(-1));return [{type:'scenario-selection',value:opts.at(-1),executionRequested:false}];});
 await visit('/reports',async()=>[await click(/^COMPLETED$/),await click(/Export Postmortem/)]);
 await visit('/operations',async()=>[await click(/Recurring Failure Patterns/),await click(/Preventive Recommendations Inbox/),await click(/Reliability Trends/),await click(/Sync Patterns/),await click(/Scan Warnings/)]);
 await visit('/cloud-lifecycle',async()=>[await click(/Infrastructure Drift/),await click(/Operations & Approvals/),await click(/Automated Schedules/),await click(/Cost & Free Tier/),await click(/Lifecycle Audit/)]);
 await visit('/sre-intelligence',async()=>[await click(/Predictive Risks/),await click(/SLOs & Burn Rates/),await click(/Capacity & Cost/),await click(/SRE Recommendations/),await click(/Refresh State/)]);
 await visit('/integrations',async()=>[await click(/Notification Rails/),await click(/Community Connectors/),await click(/Enterprise Ecosystem/),await click(/^Logs$/),await click(/Connect Provider/)]);
 await visit('/team',async()=>[await click(/Security Audit Trail/),await click(/API Service Tokens/)]);
 await visit('/auth',async()=>{const actions=[await click(/Cluster Agent Setup/),await click(/User Session & Credentials/)];await page.getByPlaceholder('operator@infrapulse.io').fill('sarah.chen@infrapulse.io');await page.locator('main input[type=password]').fill('wrong-phase23m-password');actions.push(await click(/Sign In/));await page.locator('main input[type=password]').fill('Password123!');actions.push(await click(/Sign In/));actions.push(await click(/End Session/));await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(1000);actions.push({type:'reload-after-logout',text:(await page.locator('main').innerText()).slice(0,2000)});return actions;});
 const roles=[];for(const role of ['viewer','responder','admin']){const roleToken=await login(role);await context.addCookies([{name:'infrapulse_session',value:roleToken,url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);for(const route of ['/cloud-lifecycle','/team','/runbooks']){await page.goto('http://127.0.0.1:5180'+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(800);roles.push({role,route,text:(await page.locator('main').innerText()).slice(0,4500),apiErrors:events.filter(e=>e.type==='api'&&e.status>=400).slice(-8)});}}save('browser-role-pages.json',roles);
 await page.goto('http://127.0.0.1:5180/integrations',{waitUntil:'domcontentloaded'});await page.waitForTimeout(1000);const fonts=await page.evaluate(()=>({material:document.fonts.check('24px "Material Symbols Outlined"'),geist:document.fonts.check('12px Geist')}));
 await page.screenshot({path:path.join(evidence,'visual-desktop-integrations.png'),animations:'disabled'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:path.join(evidence,'visual-mobile-integrations.png'),animations:'disabled'});
 const geometry=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,overflowing:[...document.querySelectorAll('header button,main button')].filter(e=>e.getBoundingClientRect().right>innerWidth+5).slice(0,20).map(e=>({text:e.innerText,right:e.getBoundingClientRect().right}))}));save('browser-visual.json',{fonts,geometry});
}finally{await browser.close();}
