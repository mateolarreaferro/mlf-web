import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const base = process.env.AGENTS_URL ?? 'http://127.0.0.1:8766/';
  await page.goto(base);
  await page.waitForFunction(() => window.agentsWorld?.controls);
  await page.click('#menu-button');
  await page.locator('#menu-list li[data-room="week01"] button').click();
  await page.locator('#panel-body h1').waitFor();
  assert.equal(await page.locator('#panel-body h1').innerText(), 'shape the world');
  const diagramLink = await page.getByRole('link', { name: 'Loop diagram', exact: true }).getAttribute('href');
  const diagram = await page.request.get(new URL(diagramLink, base).href);
  assert.ok(diagram.ok());
  assert.match(await diagram.text(), /<svg/);
  const evidence = await (await page.request.get(new URL('media/week01/evidence.json', base).href)).json();
  assert.ok(evidence.prototype_runs.some(run => run.status === 'complete'));
  assert.equal(evidence['subjective-run'].status, 'limit');
  assert.equal(evidence['unavailable-run'].status, 'limit');
  assert.equal(evidence.assignment_audit.demo.status, 'complete');
  const video = page.locator('#panel-body video');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate(el => el.load());
  await page.waitForFunction(() => document.querySelector('#panel-body video').readyState >= 2);
  await video.click();
  const media = await video.evaluate(async el => {
    await el.play();
    return { duration: el.duration, width: el.videoWidth, height: el.videoHeight, source: el.currentSrc };
  });
  assert.ok(Math.abs(media.duration - evidence.assignment_audit.demo.duration_seconds) < 0.1);
  assert.equal(media.width, 1440);
  assert.match(media.source, /demo\.mp4$/);
  await page.waitForFunction(() => document.querySelector('#panel-body video').currentTime > 1);
  await video.evaluate(el => el.pause());
  await page.screenshot({ path: '/private/tmp/scene-agent-proof/documentation.png' });
  console.log('Week-one page, diagram link, playable demo video, and success/failure records verified.');
} finally { await browser.close(); }
