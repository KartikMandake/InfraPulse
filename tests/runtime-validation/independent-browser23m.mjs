import { createRequire } from 'node:module';
import path from 'node:path';
import { root, evidence, save, api, login } from './independent23m.mjs';
const require = createRequire(import.meta.url);
const playwrightPath = process.env.PHASE23M_PLAYWRIGHT || 'C:/Users/karti/AppData/Local/npm-cache/_npx/83f51bd5dfda7e85/node_modules/playwright';
const { chromium } = require(playwrightPath);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PHASE23M_CHROME || 'C:/Users/karti/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--disable-gpu', '--disable-dev-shm-usage', '--renderer-process-limit=1', '--disable-extensions', '--disable-software-rasterizer', '--js-flags=--max-old-space-size=128'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('https://fonts.googleapis.com/**', r => r.abort());
await context.route('https://fonts.gstatic.com/**', r => r.abort());
const page = await context.newPage();
page.setDefaultTimeout(6000);
page.setDefaultNavigationTimeout(12000);
const events = [];
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('console', e => { if (['error', 'warning'].includes(e.type())) events.push({ type: e.type(), text: e.text() }); });
page.on('response', async r => { if (r.url().includes('/api/')) events.push({ type: 'api', url: r.url(), status: r.status() }); });
const token = await login();
await context.addCookies([{ name: 'infrapulse_session', value: token, url: 'http://127.0.0.1:5180', httpOnly: true, sameSite: 'Lax' }]);
const incidents = (await api('/api/incidents', { token })).data.data;
const services = (await api('/api/services', { token })).data.data;
const routes = ['/', '/system-overview', '/services', `/services/${services[0].id}`, '/incidents', `/incidents/${incidents[0].id}`, '/alerts', '/telemetry', '/deployments', '/slos', '/runbooks', '/fault-injection', '/reports', '/operations', '/cloud-lifecycle', '/sre-intelligence', '/integrations', '/team', '/auth'];
const results = [];
try {
  for (const route of routes) {
    const from = events.length;
    const start = performance.now();
    const response = await page.goto('http://127.0.0.1:5180' + route);
    await page.waitForFunction(() => document.querySelector('main')?.innerText.length > 100, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(700);
    const actions = [];
    // Exercise safe page controls; all provider and execution actions remain untouched.
    const controls = page.locator('main input[type=text], main input[type=search], main input:not([type])');
    if (await controls.count()) {
      const input = controls.first();
      if (await input.isVisible() && await input.isEditable()) { await input.fill('phase23m-no-match'); await page.waitForTimeout(120); actions.push({ type: 'search-empty', visible: (await page.locator('body').innerText()).slice(-600) }); await input.fill(''); }
    }
    const select = page.locator('main select').first();
    if (await select.count()) { const options = await select.locator('option').evaluateAll(nodes => nodes.map(n => n.value)); if (options.length > 1) { await select.selectOption(options[1]); actions.push({ type: 'filter', value: options[1] }); await select.selectOption(options[0]); } }
    const safeButtons = { '/services': ['List', 'Graph'], '/team': ['Audit Logs', 'API Tokens', 'Team Members'], '/telemetry': ['Logs', 'Traces', 'Metrics'], '/integrations': ['All', 'Configured'], '/incidents': ['All Incidents'], '/slos': ['Refresh'], '/sre-intelligence': ['Refresh'], '/cloud-lifecycle': ['Refresh'] }[route] || [];
    for (const label of safeButtons) { const button = page.getByRole('button', { name: label, exact: true }).first(); if (await button.count() && await button.isVisible() && await button.isEnabled()) { await button.click(); await page.waitForTimeout(200); actions.push({ type: 'button', label }); } }
    const buttons = await page.locator('button').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height).map(n => ({ text: n.innerText.trim(), title: n.title, disabled: n.disabled })).slice(0, 65));
    const desktop = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth, text: document.body.innerText.slice(0, 2500), mainText: document.querySelector('main')?.innerText.slice(0, 12000) }));
    await page.screenshot({ path: path.join(evidence, 'page-' + (route.replaceAll('/', '_') || 'home') + '.png'), timeout: 6000, animations: 'disabled' }).catch(e => actions.push({ type: 'screenshot-error', message: e.message }));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
    const mobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth }));
    if (['/', '/cloud-lifecycle', '/integrations'].includes(route)) await page.screenshot({ path: path.join(evidence, 'mobile-' + route.replaceAll('/', '_') + '.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    results.push({ route, status: response.status(), elapsedMs: performance.now() - start, desktop, mobile, actions, buttons, events: events.slice(from) });
    save('browser-results.json', results); console.log(route, response.status(), 'errors', events.slice(from).filter(e => e.type === 'pageerror').length, 'actions', actions.length);
  }
  // Browser session survives reload; explicit API login switches roles for guard checks.
  const roleResults = [];
  for (const role of ['viewer', 'responder', 'admin']) {
    const roleToken = await login(role);
    await context.addCookies([{ name: 'infrapulse_session', value: roleToken, url: 'http://127.0.0.1:5180' }]);
    await page.goto('http://127.0.0.1:5180/team'); await page.waitForTimeout(1000);
    roleResults.push({ role, text: (await page.locator('body').innerText()).slice(-2500), events: events.slice(-12) });
  }
  save('browser-roles.json', roleResults);
  // Controlled API failure and empty state, intercepted only in this browser.
  await page.route('**/api/services', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Phase 23M controlled API failure' }) }));
  await page.goto('http://127.0.0.1:5180/services'); await page.waitForTimeout(800);
  save('browser-error-state.json', { text: await page.locator('body').innerText(), events: events.slice(-15) });
  await page.unroute('**/api/services');
  await page.route('**/api/services', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  await page.reload(); await page.waitForTimeout(800);
  save('browser-empty-state.json', { text: await page.locator('body').innerText(), events: events.slice(-15) });
} finally { await browser.close(); }
