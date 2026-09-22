import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const base = process.env.AGENTS_URL || 'http://127.0.0.1:3001/agents/';
const output = process.env.ENTRANCE_OUTPUT || '/private/tmp/agents-entrance';
const key = parseEnv(readFileSync('.env.weekly-notes-owner', 'utf8')).WEEKLY_NOTES_EDIT_KEY;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.agentsWorld?.sound.scene && !document.getElementById('entrance-audio').disabled, null, { timeout: 90000 });
    assert.equal(await page.locator('#entrance').isVisible(), true);
    assert.equal(await page.locator('#environment').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => agentsWorld.sound.diagnostics().wanted), false);
    assert.match(await page.locator('#entrance-title').evaluate(el => getComputedStyle(el).fontFamily), /Helvetica/);
    assert.equal(await page.locator('.entrance-marks img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
    const position = await page.evaluate(() => ({ ...agentsWorld.walker.position }));
    await page.keyboard.press('w');
    assert.deepEqual(await page.evaluate(() => ({ ...agentsWorld.walker.position })), position);
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-splash.png` });
    await page.click('#entrance-editor');
    await page.fill('#entrance-code', 'incorrect-test-code'); await page.click('#entrance-submit');
    await page.waitForFunction(() => document.getElementById('entrance-status').textContent === 'That code isn’t correct.');
    assert.equal(await page.locator('#entrance').isVisible(), true);
    assert.equal(await page.evaluate(() => agentsWorld.sound.diagnostics().wanted), false, 'typing the code must not start sound');
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-code.png` });
    if (!mobile) {
      await page.click('#entrance-audio');
      await page.waitForFunction(() => agentsWorld.sound.state === 'on', null, { timeout: 45000 });
      assert.equal(await page.locator('#entrance-audio').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => agentsWorld.sound.scene.engine.isPlaying), true);
      await page.click('#entrance-audio');
      await page.waitForFunction(() => agentsWorld.sound.state === 'off');
    }
    await page.fill('#entrance-code', key); await page.click('#entrance-submit');
    await page.locator('#entrance').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#environment').evaluate(el => el.inert), false);
    assert.equal(await page.inputValue('#entrance-code'), '', 'code cleared after entering');
    await page.click('#notes-button');
    await page.locator('#notes-add').waitFor({ state: 'visible' });
    await page.click('#notes-close');
    await page.reload();
    await page.locator('#entrance').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.access), 'editor');
    // A fresh tab asks again; choosing guest clears the authenticated cookie.
    const guest = await context.newPage(); guest.on('pageerror', e => errors.push(e.message));
    await guest.goto(base);
    await guest.click('#entrance-guest');
    await guest.locator('#entrance').waitFor({ state: 'hidden' });
    await guest.waitForFunction(() => window.agentsWorld?.controls);
    await guest.click('#notes-button');
    await guest.waitForFunction(() => !document.getElementById('notes-auth').disabled);
    assert.equal(await guest.locator('#notes-add').isVisible(), false);
    assert.equal((await (await context.request.get(new URL('/api/weekly-notes', base).href)).json()).canEdit, false);
    assert.equal(await guest.evaluate(() => agentsWorld.sound.diagnostics().wanted), false);
    assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await guest.reload();
    await guest.locator('#entrance').waitFor({ state: 'hidden' });
    assert.equal(await guest.evaluate(() => document.documentElement.dataset.access), 'guest');
    await guest.evaluate(() => sessionStorage.setItem('agents-entry-role', 'editor'));
    await guest.reload();
    await guest.waitForFunction(() => window.agentsWorld?.controls);
    assert.equal(await guest.locator('#entrance').isVisible(), true, 'a stored role cannot replace the editor code');
    await context.close();
  }
  const embed = await browser.newPage();
  await embed.goto(base + '?embed=1');
  await embed.waitForFunction(() => window.agentsWorld?.world);
  assert.equal(await embed.locator('#entrance').isVisible(), false);
  assert.equal(await embed.evaluate(() => agentsWorld.sound.scene), null);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ base, checks: ['desktop and mobile', 'logos loaded', 'Helvetica typography', 'code rejection', 'editor login', 'guest logout and read-only notes', 'no sound before opt-in', 'audio toggle', 'blocked camera on splash', 'remembered tab role', 'silent embed'], errors }, null, 2));
  console.log('Entrance: guest/editor, code, audio, mobile, and embed checks passed.');
} finally { await browser.close(); }
