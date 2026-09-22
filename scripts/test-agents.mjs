// Browser integration check for the mirrored class site. Start its static server first.
// CHROMIUM_PATH=/path/to/chrome-headless-shell node scripts/test-agents.mjs [--visuals]
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.env.AGENTS_REVIEW_OUT ?? '/private/tmp/agents-review';
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:4173/';
const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.argv.includes('--visuals')) {
    for (const [name, viewport, hash] of [
      ['arrival', { width: 1440, height: 960 }, ''],
      ['mobile', { width: 390, height: 844 }, ''],
      ['reading', { width: 1440, height: 960 }, '#week01'],
      ['bell', { width: 1440, height: 960 }, '#final'],
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}${hash}`);
      await page.waitForFunction(() => window.agentsWorld && agentsWorld.sound.state !== 'loading', null, { timeout: 120000 });
      if (name === 'reading') {
        await page.click('#here-read');
        await page.waitForSelector('#panel-body h1');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('panel')).opacity === '1' && parseFloat(getComputedStyle(document.getElementById('world')).opacity) < 0.49);
      } else if (!hash) await page.waitForFunction(() => agentsWorld.world.sign.material.opacity > 0.8);
      await page.screenshot({ path: `${out}/${name}-final.png` });
    }
    console.log(JSON.stringify({ errors, visuals: 'passed' }));
    process.exitCode = 0;
  } else {
  await page.goto(base);
  await page.waitForFunction(() => window.agentsWorld && agentsWorld.sound.state !== 'loading', null, { timeout: 120000 });
  await page.waitForFunction(() => agentsWorld.world.sign.material.opacity > 0.8);
  await page.screenshot({ path: `${out}/arrival-after.png` });
  writeFileSync(`${out}/manifest.json`, JSON.stringify(await page.evaluate(() => agentsWorld.soundManifest()), null, 2));
  await page.evaluate(() => {
    window.fired = [];
    const scene = agentsWorld.sound.scene;
    const event = scene.event.bind(scene);
    scene.event = (...args) => { window.fired.push(args[0]); return event(...args); };
    scene.beginCapture();
  });
  await page.click('#sound-button');
  await page.waitForFunction(() => agentsWorld.sound.state === 'on');
  assert.equal(await page.evaluate(() => agentsWorld.sound.scene.engine.ctx.state), 'running');
  await page.click('#menu-button');
  await page.waitForSelector('#menu:not([hidden])');
  await page.click('#menu-button');
  await page.evaluate(() => {
    const r = agentsWorld.world.rooms.find(r => r.id === 'week01');
    agentsWorld.walker.place(r.stand.x, r.stand.y, r.stand.z, Math.atan2(r.board.x-r.stand.x, -(r.board.z-r.stand.z)));
  });
  await page.waitForSelector('#here:not([hidden])');
  await page.screenshot({ path: `${out}/week-after.png` });
  // Opening while muted must still place a later unmute into reading state.
  await page.click('#sound-button');
  await page.click('#here-read');
  await page.waitForSelector('#panel-body h1');
  assert.equal(await page.evaluate(() => agentsWorld.sound.scene.engine.sceneState), 'reading');
  assert.equal(await page.evaluate(() => document.querySelector('.hud').inert), true);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('panel')).opacity === '1' && parseFloat(getComputedStyle(document.getElementById('world')).opacity) < 0.49);
  await page.screenshot({ path: `${out}/reading-after.png` });
  await page.evaluate(() => agentsWorld.sound.toggle());
  await page.waitForFunction(() => agentsWorld.sound.state === 'on');
  assert.equal(await page.evaluate(() => agentsWorld.sound.scene.engine.sceneState), 'reading');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => agentsWorld.sound.scene.engine.sceneState), null);
  // Actual control events, plus deterministic positions for all proximity edges.
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  await page.waitForFunction(() => window.fired.includes('sprint'));
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  for (const [name, where] of [
    ['seabed_touch', 'seabed'], ['ceiling_touch', 'ceiling'], ['edge_touch', 'edge'],
    ['bud_stir', 'bud'], ['attractor_pass', 'attractor'], ['bell_enter', 'bell'], ['bell_leave', 'water'],
  ]) {
    await page.evaluate(where => {
      const { world: w, walker } = agentsWorld;
      let p;
      if (where === 'seabed') p = [15, w.ground(15, 0) + 0.6, 0];
      if (where === 'ceiling') p = [15, w.ceiling - 0.1, 0];
      if (where === 'edge') p = [32.8, 10, 0];
      if (where === 'water') p = [15, 10, 0];
      if (where === 'bud') { const r = w.rooms.find(r => !r.open); p = [r.center.x, r.center.y, r.center.z + 1]; }
      if (where === 'attractor') { const s = w.stones[0]; p = [s.x, s.y, s.z + s.radius * 1.3]; }
      if (where === 'bell') { const r = w.rooms.find(r => r.final); p = [r.stand.x, r.stand.y, r.stand.z]; }
      walker.place(...p, 0);
    }, where);
    await page.waitForFunction(name => window.fired.includes(name), name);
  }
  // A short real glide keeps the test independent of software-GPU speed.
  await page.evaluate(() => {
    const r = agentsWorld.world.rooms.find(r => r.id === 'week01');
    agentsWorld.walker.place(r.stand.x + 2, r.stand.y, r.stand.z + 4, 0);
  });
  await page.click('#menu-button');
  await page.click('#menu-list [data-room="week01"] button');
  await page.waitForFunction(() => window.fired.includes('glide_start'));
  await page.waitForSelector('#panel:not([hidden])', { timeout: 30000 });
  await page.waitForSelector('#panel-body h1');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fired.includes('glide_end'));

  // Record the actual engine output, including reading attenuation and ascent.
  const recording = await page.evaluate(async () => {
    const { sound, walker, world } = agentsWorld;
    const engine = sound.scene.engine;
    const destination = engine.ctx.createMediaStreamDestination();
    engine.outputNode.connect(destination);
    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(resolve => recorder.onstop = resolve);
    const analyser = engine.ctx.createAnalyser();
    analyser.fftSize = 2048;
    engine.outputNode.connect(analyser);
    const rms = () => { const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b); return Math.sqrt(b.reduce((a,x) => a+x*x, 0)/b.length); };
    const rows = [];
    const started = performance.now();
    const timer = setInterval(() => rows.push({ at: (performance.now()-started)/1000, rms: rms(), state: engine.sceneState, levels: engine.levelReport() }), 500);
    recorder.start();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(5000);
    document.getElementById('here-read').click();
    await wait(5500);
    document.getElementById('panel-close').click();
    await wait(5000);
    const bell = world.rooms.find(r => r.final);
    walker.place(bell.stand.x, bell.stand.y, bell.stand.z, 0);
    await wait(7000);
    recorder.stop(); await done;
    clearInterval(timer);
    engine.outputNode.disconnect(destination); engine.outputNode.disconnect(analyser);
    const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
    let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
    return { base64: btoa(binary), rows, telemetry: sound.scene.endCapture(), events: window.fired, waveMatches: Math.abs(sound.scene.signals.get('swell') - world.swell) < 0.000001 };
  });
  writeFileSync(`${out}/route.webm`, Buffer.from(recording.base64, 'base64'));
  delete recording.base64;
  assert.ok(recording.waveMatches, 'audio and picture share one swell');
  const expected = await page.evaluate(() => agentsWorld.soundManifest().scene.events.map(e => e.name));
  assert.deepEqual(expected.filter(e => !recording.events.includes(e)), [], 'every declared event fired');
  const accepted = new Set(recording.telemetry.actions.filter(a => a.kind === 'event' && a.accepted).map(a => a.name));
  assert.deepEqual(expected.filter(e => !accepted.has(e)), [], 'every declared event accepted by a loaded voice');
  const signalCheck = await page.evaluate(() => {
    const e = agentsWorld.sound.scene.engine;
    return { ascent: e.signalValue(null, 'ascent'),
      filters: [...e.tracks.values()].filter(t => /sing/.test(t.statement.sourceId ?? '')).map(t => t.dspChain?.filterRef?.filter.frequency.value),
      shimmer: [...e.tracks.values()].filter(t => t.statement.sourceId === 'upper_water_shimmer').map(t => t.volume),
      sand: [...e.tracks.values()].filter(t => t.statement.sourceId === 'seabed_grains').map(t => t.volume) };
  });
  assert.ok(signalCheck.ascent > 0.95, 'height signal reaches the engine at the bell');
  assert.ok(signalCheck.filters.every(hz => hz > 500), 'vocal filters preserve the audible range');
  assert.ok(signalCheck.shimmer.every(v => v > 0.9) && signalCheck.sand.every(v => v < 0.05), 'beds change with height');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...recording, errors }, null, 2));
  await page.screenshot({ path: `${out}/bell-after.png` });
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.goto(base);
  await mobile.waitForFunction(() => window.agentsWorld && agentsWorld.sound.state === 'ready', null, { timeout: 120000 });
  await mobile.tap('#sound-button');
  await mobile.waitForFunction(() => agentsWorld.sound.state === 'on');
  await mobile.screenshot({ path: `${out}/mobile-after.png` });
  await mobile.tap('#sound-button');
  assert.equal(await mobile.evaluate(() => agentsWorld.sound.state), 'off');
  await mobile.reload();
  await mobile.waitForFunction(() => window.agentsWorld && agentsWorld.sound.scene, null, { timeout: 120000 });
  await mobile.tap('#world', { position: { x: 180, y: 650 } });
  assert.equal(await mobile.evaluate(() => agentsWorld.sound.state), 'off', 'mute survives reload and canvas touches');
  await mobile.evaluate(() => localStorage.removeItem('agents-sound-off'));
  await mobile.reload();
  await mobile.waitForFunction(() => window.agentsWorld && agentsWorld.sound.state === 'ready', null, { timeout: 120000 });
  await mobile.tap('#world', { position: { x: 180, y: 650 } });
  await mobile.waitForFunction(() => agentsWorld.sound.state === 'on');
  console.log(JSON.stringify({ errors, events: [...new Set(recording.events)], waveMatches: recording.waveMatches, touch: 'passed', report: `${out}/report.json` }));
  }
} finally { await browser.close(); }
