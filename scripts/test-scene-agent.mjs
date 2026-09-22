// Browser verification of the shared environment; RUN_LOCAL_AGENT=1 also tests real inference.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:8766/';
const executablePath = process.env.CHROMIUM_PATH ?? '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const output = '/private/tmp/scene-agent-proof'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('agents-sound-off', '1'));
    await page.goto(base);
    await page.waitForFunction(() => window.agentsWorld?.controls);
    await page.locator('#edit-button').click();
    const localAgent = await page.evaluate(() => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
    if (!localAgent) {
      assert.equal(await page.locator('#agent-form').count(), 0);
      assert.equal(await page.locator('#agent-setup').count(), 0);
      assert.equal(await page.locator('#agent-trace').count(), 0);
    }
    // On the public site only manual editing is offered; presets still accept text.
    await page.locator('.editor-presets summary').click();
    const textbox = localAgent ? page.getByRole('textbox', { name: 'describe a scene change' }) : page.getByLabel('scene name', { exact: true });
    await textbox.fill('warmer water and slower motion');
    assert.equal(await textbox.inputValue(), 'warmer water and slower motion');
    const before = await page.evaluate(() => agentsWorld.walker.position.clone());
    await textbox.press('w');
    const after = await page.evaluate(() => agentsWorld.walker.position.clone());
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) < 0.05, 'typing must not swim');
    const originalFog = await page.getByLabel('view distance', { exact: true }).inputValue();
    await page.getByLabel('motion speed', { exact: true }).fill('0.4');
    await page.getByLabel('brightness', { exact: true }).fill('0.55');
    await page.getByLabel('water color', { exact: true }).fill('#142c38');
    await page.getByLabel('view distance', { exact: true }).fill('28');
    await page.waitForFunction(() => agentsWorld.controls.inspect().values['motion.speed'] === 0.4);
    const visual = await page.evaluate(() => ({ values: agentsWorld.world.controlValues(), fog: agentsWorld.world.scene.fog.far,
      brightness: agentsWorld.world.scene.children.find(n => n.material?.uniforms?.uBrightness)?.material.uniforms.uBrightness.value }));
    assert.equal(visual.fog, 28); assert.equal(visual.brightness, 0.55); assert.equal(visual.values['visual.water'], '#142c38');
    await page.getByRole('button', { name: 'undo', exact: true }).click();
    assert.equal(await page.getByLabel('view distance', { exact: true }).inputValue(), originalFog);
    await page.getByLabel('scene name', { exact: true }).fill('quiet water');
    await page.getByRole('button', { name: 'save', exact: true }).click();
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await page.getByLabel('saved scenes', { exact: true }).selectOption('quiet water');
    assert.equal(await page.getByLabel('motion speed', { exact: true }).inputValue(), '0.4');
    const rejected = await page.evaluate(async () => {
      const c = agentsWorld.controls, rev = c.inspect().revision;
      c.patch({ 'motion.speed': 0.6 });
      return [await c.execute({ kind: 'SET', parameter: 'motion.speed', value: 2, revision: rev }),
        await c.execute({ kind: 'SET', parameter: 'motion.speed', value: 900 }),
        await c.execute({ kind: 'SET', parameter: 'audio.rain', value: 0.5 })];
    });
    assert.ok(rejected.every(r => !r.ok), 'stale, out-of-range and unavailable controls must reject');
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await page.waitForFunction(() => agentsWorld.sound.scene && agentsWorld.sound.state === 'off', null, { timeout: 120000 });
    await page.click('#sound-button');
    await page.waitForFunction(() => agentsWorld.sound.state === 'on', null, { timeout: 30000 });
    await page.locator('#scene-fields details').filter({ has: page.locator('summary', { hasText: /^satie mixer$/ }) }).locator('summary').click();
    await page.getByLabel('low drone', { exact: true }).fill('0.25');
    await page.getByLabel('rain', { exact: true }).fill('0.45');
    await page.waitForFunction(() => agentsWorld.sound.controlTelemetry().some(t => t.group === 'audio.drone' && t.gain < 0.26));
    const audio = await page.evaluate(async () => {
      const engine = agentsWorld.sound.scene.engine;
      const track = [...engine.tracks.values()].find(t => t.statement.sourceId === 'deep_body_drone' && t.sourceNode);
      const pre = engine.audioContext.createAnalyser(), post = engine.audioContext.createAnalyser();
      pre.fftSize = post.fftSize = 2048; track.gainNode.connect(pre); track.scaleGain.connect(post);
      await new Promise(resolve => setTimeout(resolve, 250));
      const rms = node => { const data = new Float32Array(node.fftSize); node.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((a, n) => a + n * n, 0) / data.length); };
      const result = { before: rms(pre), after: rms(post), telemetry: agentsWorld.sound.controlTelemetry(), values: agentsWorld.controls.inspect().values };
      track.gainNode.disconnect(pre); track.scaleGain.disconnect(post); return result;
    });
    assert.ok(audio.before > 0.00001, 'the source must contain real audio');
    assert.ok(audio.after / audio.before < 0.3 && audio.after / audio.before > 0.2, 'actual waveform amplitude follows the 0.25 trim');
    assert.equal(audio.values['audio.voices'], 1);
    assert.ok(audio.telemetry.filter(t => t.group === 'audio.voices').every(t => t.gain === 1), 'singing voices preserved');
    await page.evaluate(async () => {
      window.sceneAgentAudioStates = [];
      agentsWorld.sound.onChange(state => sceneAgentAudioStates.push(state));
      window.sceneAgentResumeTrack = [...agentsWorld.sound.scene.engine.tracks.values()].find(t => t.sourceNode);
      window.sceneAgentResumeSource = sceneAgentResumeTrack.sourceNode;
      await agentsWorld.sound.scene.engine.audioContext.suspend();
    });
    // The scene's playback watchdog resumes the context automatically.
    // A click after it has resumed would correctly mute it again.
    await page.waitForFunction(() => agentsWorld.sound.state === 'on').catch(async error => {
      console.error('resume states', await page.evaluate(() => ({ state: agentsWorld.sound.state, states: window.sceneAgentAudioStates, context: agentsWorld.sound.scene?.engine.audioContext.state })));
      throw error;
    });
    assert.ok(await page.evaluate(() => sceneAgentResumeTrack.sourceNode === sceneAgentResumeSource), 'audio interruption resumes the same source');
    await page.click('#sound-button');
    await page.waitForFunction(() => agentsWorld.sound.state === 'off');
    await page.click('#sound-button');
    await page.waitForFunction(() => agentsWorld.sound.state === 'on');
    await page.waitForFunction(() => agentsWorld.sound.controlTelemetry().some(t => t.group === 'audio.drone' && t.gain <= 0.26));
    assert.equal(await page.evaluate(() => agentsWorld.controls.inspect().values['audio.drone']), 0.25, 'mixer survives mute and restart');
    await page.locator('#scene-editor').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}.png` });
    if (!mobile && process.env.RUN_LOCAL_AGENT === '1') {
      await page.getByRole('button', { name: 'reset', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'describe a scene change' });
      await input.fill('Set motion speed to 0.4 and rain to 0.3. Keep singing voices at 1.');
      await page.waitForFunction(() => !document.getElementById('agent-submit').disabled, null, { timeout: 20000 });
      await page.getByRole('button', { name: 'reshape', exact: true }).click();
      await page.waitForFunction(() => !document.getElementById('agent-stop').hidden);
      await page.waitForFunction(() => document.getElementById('agent-stop').hidden, null, { timeout: 240000 });
      const status = await page.locator('#editor-status').innerText();
      writeFileSync(`${output}/agent-ui.txt`, await page.locator('#agent-log').innerText());
      assert.match(status, /Changes verified/, status);
      assert.equal(await page.getByLabel('motion speed', { exact: true }).inputValue(), '0.4');
      assert.equal(await page.getByLabel('rain', { exact: true }).inputValue(), '0.3');
      await page.locator('#scene-editor').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: `${output}/agent-complete.png` });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: mobile ? 'mobile' : 'desktop', controls: 'passed', actualDroneAmplitudeRatio: audio.after / audio.before, errors }));
    await page.close();
  }
} finally { await browser.close(); }
