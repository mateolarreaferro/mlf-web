import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const sound = readFileSync('agents2026-mateo/website/js/sound.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const mixer of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.route('**/js/sound.js', route => route.fulfill({ contentType: 'text/javascript', body: mixer ? sound : sound.replace('function updateTrims() {', 'function updateTrims() { return;') }));
    await page.goto('http://127.0.0.1:8766/');
    await page.click('#entrance-guest'); await page.click('#entrance-quiet'); await page.locator('#entrance').waitFor({ state: 'hidden' });
    await page.click('#edit-button');
    await page.click('#sound-button'); await page.waitForFunction(() => agentsWorld.sound.state === 'on');
    const samples = await page.evaluate(async () => {
      const engine = agentsWorld.sound.scene.engine, context = engine.audioContext;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; engine.outputNode.connect(analyser);
      const rows = [];
      for (let i = 0; i < 12; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const data = new Float32Array(2048); analyser.getFloatTimeDomainData(data);
        rows.push({ state: agentsWorld.sound.state, time: context.currentTime, rms: Math.sqrt(data.reduce((a, n) => a + n*n, 0) / data.length) });
      }
      engine.outputNode.disconnect(analyser); return rows;
    });
    results.push({ mixer, samples }); console.log(JSON.stringify({ mixer, min: Math.min(...samples.map(s => s.rms)), max: Math.max(...samples.map(s => s.rms)) }));
    await page.close();
  }
  writeFileSync('/private/tmp/scene-agent-proof/mixer-baseline.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
