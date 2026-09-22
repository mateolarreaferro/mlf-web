// Real local inference: subjective interpretation and an unavailable control.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:8766/';
const executablePath = process.env.CHROMIUM_PATH ?? '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const output = '/private/tmp/scene-agent-planned-proof'; mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('agents-sound-off', '1'));
  await page.goto(base); await page.waitForFunction(() => window.agentsWorld?.sound.scene && agentsWorld.sound.state === 'off', null, { timeout: 120000 });
  await page.click('#edit-button');
  await page.click('#sound-button'); await page.waitForFunction(() => agentsWorld.sound.state === 'on');
  await page.waitForFunction(() => !document.getElementById('agent-submit').disabled);
  async function run(goal) {
    await page.getByRole('textbox', { name: 'describe a scene change' }).fill(goal);
    const response = page.waitForResponse(response => response.url().endsWith('/agent-api/start'));
    await page.click('#agent-submit');
    const { id } = await (await response).json(); assert.ok(id);
    await page.waitForFunction(() => !document.getElementById('agent-stop').hidden);
    await page.waitForFunction(() => document.getElementById('agent-stop').hidden, null, { timeout: 240000 });
    return (await page.request.get(`${base}agent-api/runs/${id}`)).json();
  }
  const creative = await run('Make the rain much softer and ease the low drone. Keep the singing voices and the visuals unchanged.');
  writeFileSync(`${output}/subjective-run.json`, JSON.stringify(creative, null, 2));
  // Assert this concrete request. Save every run, including a failure; this
  // is not an estimate of the model's general success rate.
  assert.equal(creative.status, 'complete', creative.summary);
  assert.ok(creative.final.values['audio.drone'] < creative.initial.values['audio.drone']);
  for (const [key, value] of Object.entries(creative.initial.values)) {
    if (!['audio.rain', 'audio.drone'].includes(key)) assert.equal(creative.final.values[key], value, `${key} must stay unchanged`);
  }
  assert.ok(creative.final.values['audio.rain'] < 1);
  assert.equal(creative.final.values['audio.voices'], 1);
  console.log(JSON.stringify({ scenario: 'subjective', status: creative.status, values: creative.final.values, modelCalls: creative.model_calls }));
  await page.click('#sound-button'); await page.waitForFunction(() => agentsWorld.sound.state === 'off');
  const blocked = await run('Set rain to 0.4.');
  writeFileSync(`${output}/unavailable-run.json`, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.status, 'blocked', blocked.summary);
  assert.equal(blocked.model_calls, 1);
  assert.equal(blocked.final.values['audio.rain'], creative.final.values['audio.rain']);
  console.log(JSON.stringify({ scenario: 'muted audio', status: blocked.status, summary: blocked.summary, modelCalls: blocked.model_calls }));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
