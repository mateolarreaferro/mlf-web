// Real hosted inference against a browser scene; no model replies are substituted.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:3001/agents/';
const output = process.env.AGENT_OUTPUT ?? '/private/tmp/scene-web-agent';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('agents-sound-off', '1'));
  await page.goto(base);
  await page.waitForFunction(() => window.agentsWorld?.sound.scene && agentsWorld.sound.state === 'off', null, { timeout: 120000 });
  await page.click('#edit-button');
  await page.locator('#agent-form').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('#agent-setup').count(), 0, 'no local setup text on the web');
  await page.click('#sound-button');
  await page.waitForFunction(() => agentsWorld.sound.state === 'on');
  async function run(goal, name) {
    await page.locator('#agent-goal').fill(goal);
    await page.click('#agent-submit');
    await page.waitForFunction(() => document.getElementById('agent-form').dataset.state === 'running');
    await page.waitForFunction(() => document.getElementById('agent-form').dataset.state !== 'running', null, { timeout: 180000 });
    await page.locator('#agent-trace').evaluate(el => { el.open = true; });
    const downloaded = page.waitForEvent('download'); await page.click('#agent-export');
    const download = await downloaded; const path = `${output}/${name}.json`; await download.saveAs(path);
    const record = JSON.parse(readFileSync(path, 'utf8'));
    console.log(JSON.stringify({ scenario: name, status: record.status, calls: record.model_calls, summary: record.summary, targets: record.plan?.targets }));
    return record;
  }
  const audio = await run('Make the rain much softer and ease the low drone. Keep the singing voices and the visuals unchanged.', 'audio');
  assert.equal(audio.status, 'complete', audio.summary);
  assert.ok(audio.final.values['audio.rain'] < 1); assert.ok(audio.final.values['audio.drone'] < 1);
  for (const [key, value] of Object.entries(audio.initial.values)) {
    if (!['audio.rain', 'audio.drone'].includes(key)) assert.equal(audio.final.values[key], value, key);
  }
  const telemetry = await page.evaluate(() => agentsWorld.sound.controlTelemetry());
  assert.ok(telemetry.filter(t => t.group === 'audio.voices').every(t => t.gain === 1));
  assert.ok(telemetry.filter(t => t.group === 'audio.drone').every(t => Math.abs(t.gain - audio.final.values['audio.drone']) < 0.01));
  const visual = await run('Turn the water deep teal and make the creature noticeably dimmer. Keep all sound levels and movement unchanged.', 'visual');
  assert.equal(visual.status, 'complete', visual.summary);
  assert.notEqual(visual.final.values['visual.water'], visual.initial.values['visual.water']);
  assert.ok(visual.final.values['visual.brightness'] < visual.initial.values['visual.brightness']);
  for (const [key, value] of Object.entries(visual.initial.values)) {
    if (key.startsWith('audio.') || key.startsWith('motion.')) assert.equal(visual.final.values[key], value, key);
  }
  await page.click('#sound-button');
  await page.waitForFunction(() => agentsWorld.sound.state === 'off');
  const muted = await run('Make the rain quieter.', 'muted');
  assert.equal(muted.status, 'blocked', muted.summary);
  assert.deepEqual(muted.final.values, muted.initial.values);
  assert.match(muted.summary, /sound|audio|playback/i);
  await page.locator('#agent-trace').evaluate(el => { el.open = false; });
  await page.locator('#scene-editor').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ base, model: audio.model, audio: audio.status, visual: visual.status,
    muted: muted.status, telemetry, errors, modelCalls: audio.model_calls + visual.model_calls + muted.model_calls }, null, 2));
} finally { await browser.close(); }
