// Regression check for first playback, swimming and browser audio interruptions.
// CHROMIUM_PATH=/path/to/chrome-headless-shell node scripts/test-agents-audio.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage(touch
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => agentsWorld?.sound.state === 'ready', null, { timeout: 120000 });
    const pressSound = () => touch ? page.tap('#sound-button') : page.click('#sound-button');
    await pressSound();
    await page.waitForFunction(() => agentsWorld.sound.state === 'on', null, { timeout: 120000 });
    if (!touch) {
      const y = await page.evaluate(() => agentsWorld.walker.position.y);
      await page.keyboard.down('KeyW');
      try { await page.waitForFunction(y => agentsWorld.walker.position.y > y + 0.03, y, { timeout: 5000 }); }
      finally { await page.keyboard.up('KeyW'); }
      assert.equal(await page.evaluate(() => agentsWorld.sound.state), 'on', 'swimming after a pointer click must not mute');
    }
    // Measure the real master output while idle, well past the reported cutoff.
    const samples = await page.evaluate(async () => {
      const engine = agentsWorld.sound.scene.engine, context = engine.audioContext;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      engine.outputNode.connect(analyser);
      const rows = [];
      try {
        for (let i = 0; i < 12; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          rows.push({ state: agentsWorld.sound.state, context: context.state, time: context.currentTime,
            rms: Math.sqrt(data.reduce((sum, n) => sum + n*n, 0) / data.length) });
        }
      } finally { engine.outputNode.disconnect(analyser); }
      return rows;
    });
    assert.ok(samples.every(row => row.state === 'on' && row.context === 'running' && row.rms > 0.005), 'arrival must sustain useful output, not merely a near-silent signal');
    assert.ok(samples.at(-1).time - samples[0].time > 10, 'audio clock keeps advancing');

    // A browser interruption must be reflected in the UI and resume the same voices.
    await page.evaluate(async () => {
      const engine = agentsWorld.sound.scene.engine;
      window.playbackTrack = [...engine.tracks.values()].find(track => track.sourceNode);
      window.playbackSource = playbackTrack.sourceNode;
      await engine.audioContext.suspend();
    });
    await page.waitForFunction(() => document.getElementById('sound-button').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.evaluate(() => agentsWorld.sound.state), 'ready');
    await pressSound();
    await page.waitForFunction(() => agentsWorld.sound.state === 'on');
    assert.equal(await page.evaluate(() => playbackTrack.sourceNode === playbackSource), true, 'resume must preserve the current scene');

    // An explicit mute stays muted while swimming; keyboard activation retains focus.
    await pressSound();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => agentsWorld.sound.state), 'off');
    await page.focus('#sound-button');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => agentsWorld.sound.state === 'on');
    await page.focus('#sound-button');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => agentsWorld.sound.state), 'off', 'a keyboard-focused sound button still supports Space');

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ input: touch ? 'touch' : 'mouse and keyboard', audibleSeconds: 12,
      minimumRms: Math.min(...samples.map(row => row.rms)), satieLifecycle: 'loaded scene, synchronous resume, then start', interruptions: 'resumed', errors }));
    await page.close();
  }
} finally { await browser.close(); }
