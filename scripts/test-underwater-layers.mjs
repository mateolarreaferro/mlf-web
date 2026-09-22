// Check the actual Satie voices, mixer routing and output at three listening points.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:8766/';
const executablePath = process.env.CHROMIUM_PATH ?? '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const output = '/private/tmp/agents-underwater-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [], warnings = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.agentsWorld?.sound.state === 'ready', null, { timeout: 120000 });
  await page.click('#edit-button');
  await page.click('#sound-button');
  await page.waitForFunction(() => agentsWorld.sound.state === 'on');
  const report = await page.evaluate(async () => {
    const engine = agentsWorld.sound.scene.engine;
    const tracks = () => [...engine.tracks.values()];
    const ids = ['water_choir_low', 'water_choir_middle', 'water_choir_high',
      'slow_current_resonance', 'underwater_harmonic_haze', 'midwater_bubbles'];
    const analyser = engine.audioContext.createAnalyser(); analyser.fftSize = 4096;
    engine.outputNode.connect(analyser);
    const destination = engine.audioContext.createMediaStreamDestination();
    engine.outputNode.connect(destination);
    const recording = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = []; recording.ondataavailable = event => chunks.push(event.data);
    recording.start();
    const samples = [];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (const position of [[0, 2.6, 17], [2.91, 3.5, 10], [0, 20, 4]]) {
      agentsWorld.walker.place(...position, 0);
      await wait(1500);
      for (let i = 0; i < 8; i++) {
        await wait(500);
        const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
        samples.push({ position, rms: Math.sqrt(data.reduce((a, n) => a + n * n, 0) / data.length),
          peak: Math.max(...data.map(Math.abs)), context: engine.audioContext.state });
      }
    }
    const voices = tracks().filter(t => ids.includes(t.statement.sourceId)).map(t => ({
      id: t.statement.sourceId, playing: Boolean(t.sourceNode), wet: t._reverbWet,
      pitch: t.pitch, clip: t.statement.clip,
    }));
    const existingWet = tracks().filter(t => t.statement.sourceId?.startsWith('bell_singer_')).map(t => t._reverbWet);
    const stopped = new Promise(resolve => recording.onstop = resolve);
    recording.stop(); await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    engine.outputNode.disconnect(destination); destination.stream.getTracks().forEach(t => t.stop());
    engine.outputNode.disconnect(analyser);
    let voiceTrims = [], controlError = null;
    try {
      agentsWorld.controls.patch({ 'audio.voices': 0.25 });
      await wait(300);
      voiceTrims = agentsWorld.sound.controlTelemetry().filter(t => t.group === 'audio.voices');
      agentsWorld.controls.patch({ 'audio.voices': 1 });
    } catch (error) { controlError = error.message; }
    return { voices, existingWet, samples, voiceTrims, engineErrors: engine.errors ?? [],
      controlError, state: agentsWorld.sound.state, diagnostics: agentsWorld.sound.diagnostics(),
      audioBase64: btoa(binary) };
  });
  writeFileSync(`${output}/audition.webm`, Buffer.from(report.audioBase64, 'base64'));
  delete report.audioBase64;
  writeFileSync(`${output}/report.json`, JSON.stringify({ ...report, pageErrors: errors, warnings }, null, 2));
  assert.equal(report.voices.length, 6, 'all six new Satie layers must resolve');
  assert.equal(report.controlError, null);
  assert.ok(report.voices.every(v => v.playing && v.wet >= 0.65), 'new voices must play with reverb');
  assert.equal(report.existingWet.length, 3);
  assert.ok(report.existingWet.every(wet => wet === 0.78));
  assert.equal(report.voiceTrims.length, 7, 'four original singers and three new singers share the voice control');
  assert.ok(report.voiceTrims.every(t => Math.abs(t.gain - 0.25) < 0.01));
  assert.ok(report.samples.every(s => s.context === 'running' && s.rms > 0.0001));
  assert.ok(report.samples.every(s => s.peak < 0.95), 'retain measured output headroom');
  assert.deepEqual(report.engineErrors, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ newLayers: report.voices.length, controlledSingers: report.voiceTrims.length,
    minimumRms: Math.min(...report.samples.map(s => s.rms)), peak: Math.max(...report.samples.map(s => s.peak)),
    report: `${output}/report.json`, recording: `${output}/audition.webm`, errors }));
} finally { await browser.close(); }
