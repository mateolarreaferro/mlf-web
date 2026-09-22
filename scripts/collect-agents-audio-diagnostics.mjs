import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const url = process.env.AGENTS_URL ?? 'https://mateolarreaferro.com/agents';
const exe = process.env.CHROMIUM_PATH;
if (!exe) throw new Error('Set CHROMIUM_PATH');
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], requests = [], responses = [], consoleLog = [];
page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message, stack: e.stack }));
page.on('console', m => consoleLog.push({ type: m.type(), text: m.text() }));
page.on('requestfailed', r => requests.push({ url: r.url(), failure: r.failure()?.errorText }));
page.on('response', r => { if (r.status() >= 400) responses.push({ url: r.url(), status: r.status() }); });
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => window.agentsWorld?.sound?.state !== 'loading', null, { timeout: 120000 });
const sample = async (label) => page.evaluate((label) => {
  const s = agentsWorld.sound, e = s.scene?.engine, ctx = e?.audioContext;
  let rms = null;
  if (e?.outputNode && ctx) {
    const a = ctx.createAnalyser(); a.fftSize = 2048; e.outputNode.connect(a);
    const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
    rms = Math.sqrt(d.reduce((sum, x) => sum + x * x, 0) / d.length);
    a.disconnect();
  }
  return { label, state: s.state, diagnostics: s.diagnostics?.() ?? null, engine: { ctx: ctx?.state, currentTime: ctx?.currentTime, isPlaying: e?.isPlaying, tracks: e?.tracks?.size, outputNode: e?.outputNode?.constructor?.name }, rms };
}, label);
const samples = [await sample('before')];
await page.locator('#sound-button').click();
for (let i = 1; i <= 12; i++) { await page.waitForTimeout(500); samples.push(await sample(`after-${i * 0.5}s`)); }
const report = { url, samples, errors, requests, responses, console: consoleLog.filter(x => x.type === 'error' || x.type === 'warning') };
writeFileSync('/tmp/agents-audio-diagnostics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
