// Exercise real storage and the actual 3D UI. Only this run's notes are removed.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const base = process.env.AGENTS_URL || 'http://127.0.0.1:3001/agents/';
const origin = new URL(base).origin;
const output = process.env.NOTES_OUTPUT || '/private/tmp/weekly-notes-check';
const key = parseEnv(readFileSync('.env.weekly-notes-owner', 'utf8')).WEEKLY_NOTES_EDIT_KEY;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
await context.addInitScript(() => localStorage.setItem('agents-sound-off', '1'));
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const testIds = new Set();
let originalIds = new Set();
const api = async (body, request = context.request) => {
  const response = body ? await request.post(`${origin}/api/weekly-notes`, { headers: { Origin: origin }, data: body }) : await request.get(`${origin}/api/weekly-notes`);
  return { status: response.status(), body: await response.json() };
};
try {
  const before = await api(); assert.equal(before.body.ready, true, JSON.stringify(before));
  originalIds = new Set(before.body.notes.map(n => n.id));
  await page.goto(base + '#week01');
  await page.click('#entrance-editor');
  await page.fill('#entrance-code', key);
  await page.click('#entrance-submit');
  await page.locator('#entrance').waitFor({ state: 'hidden' });
  await page.locator('#notes-button').waitFor();
  await page.waitForFunction(() => !document.getElementById('notes-button').disabled);
  await page.click('#notes-button');
  await page.locator('#notes-add').waitFor({ state: 'visible' });
  const fixtures = [
    'A room that listens.\n\nWhat if the space changed with the way we pay attention?',
    'Less instruction.\nMore discovery.\n\nLet sound carry the wayfinding.',
    'Things to try\n\nA slower current.\nVoices further away.\nOne small surprise.'
  ];
  for (const text of fixtures) {
    await page.click('#notes-add');
    testIds.add(await page.locator('.notes-index-item').last().getAttribute('data-note-id'));
    await page.fill('#note-text', text);
    await page.locator('#note-text').press('End');
    const position = await page.evaluate(() => ({ ...agentsWorld.walker.position }));
    await page.locator('#note-text').press('w');
    assert.deepEqual(await page.evaluate(() => ({ ...agentsWorld.walker.position })), position, 'typing must not swim');
    await page.fill('#note-text', text);
    await page.click('#note-done');
    await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'saved', null, { timeout: 45000 });
    const saved = await api();
    const note = saved.body.notes.find(n => n.text === text && !originalIds.has(n.id));
    assert.ok(note, 'saved note returned by uncached read'); testIds.add(note.id);
  }
  await page.screenshot({ path: `${output}/desktop-board.png` });
  const firstId = [...testIds][0];
  const beforeDrag = (await api()).body.notes.find(n => n.id === firstId);
  const screen = await page.evaluate(id => {
    let card; agentsWorld.world.scene.traverse(object => { if (object.userData.noteId === id) card = object; });
    const at = card.position.clone(); card.localToWorld(at.set(0, 0, 0)); at.project(agentsWorld.camera);
    return { x: (at.x + 1) / 2 * innerWidth, y: (1 - at.y) / 2 * innerHeight };
  }, firstId);
  await page.mouse.move(screen.x, screen.y); await page.mouse.down();
  await page.mouse.move(screen.x + 65, screen.y + 38, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'saved');
  const afterDrag = (await api()).body.notes.find(n => n.id === firstId);
  assert.ok(Math.abs(afterDrag.x - beforeDrag.x) > 0.2, 'drag saves a new 3D position');
  await page.locator(`.notes-index-item[data-note-id="${firstId}"]`).click();
  await page.getByRole('button', { name: 'rose', exact: true }).click();
  await page.screenshot({ path: `${output}/desktop-writing.png` });
  await page.click('#note-done');
  // An interrupted save keeps the draft through a page reload.
  await page.locator(`.notes-index-item[data-note-id="${firstId}"]`).click();
  await page.route('**/api/weekly-notes', route => route.abort());
  await page.fill('#note-text', 'This draft survives a dropped connection.');
  await page.waitForFunction(() => document.getElementById('note-save-status').textContent.includes('Couldn’t save'));
  await page.unroute('**/api/weekly-notes');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.waitForFunction(() => document.getElementById('notes-button') && !document.getElementById('notes-button').disabled);
  await page.click('#notes-button');
  await page.locator(`.notes-index-item[data-note-id="${firstId}"]`).click();
  assert.equal(await page.inputValue('#note-text'), 'This draft survives a dropped connection.');
  await page.click('#note-done');
  await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'saved');
  // Other browsers read the saved document, but cannot change it.
  const visitor = await browser.newContext();
  const publicData = await api(undefined, visitor.request);
  assert.equal(publicData.body.canEdit, false);
  assert.ok(publicData.body.notes.some(n => n.id === firstId && n.color === 'rose'));
  const existing = publicData.body.notes.find(n => n.id === firstId);
  assert.equal((await api({ ...existing, action: 'save', text: 'unauthorized' }, visitor.request)).status, 401);
  const csrf = await context.request.post(`${origin}/api/weekly-notes`, { headers: { Origin: 'https://example.invalid' }, data: { ...existing, action: 'save', text: 'csrf' } });
  assert.equal(csrf.status(), 403);
  // Simulate another device saving while the original browser is writing.
  await page.locator(`.notes-index-item[data-note-id="${firstId}"]`).click();
  const other = await api({ ...existing, action: 'save', text: 'Saved on another device.' }); assert.equal(other.status, 200);
  await page.fill('#note-text', 'My unfinished draft survives a conflict.');
  await page.locator('#note-conflict').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.inputValue('#note-text'), 'My unfinished draft survives a conflict.');
  await page.click('#note-keep-draft');
  await page.waitForFunction(() => document.getElementById('note-save-status').textContent === 'saved');
  assert.equal((await api()).body.notes.find(n => n.id === firstId).text, 'My unfinished draft survives a conflict.');
  await page.click('#note-done');
  // The next week starts independently, including unpublished rooms.
  await page.selectOption('#notes-week', 'week02');
  await page.click('#notes-add');
  testIds.add(await page.locator('.notes-index-item').last().getAttribute('data-note-id'));
  await page.fill('#note-text', 'A thought for week two.'); await page.click('#note-done');
  await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'saved');
  const weekTwo = (await api()).body.notes.find(n => n.week === 'week02' && n.text === 'A thought for week two.' && !originalIds.has(n.id));
  assert.ok(weekTwo); testIds.add(weekTwo.id);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('notes-button') && !document.getElementById('notes-button').disabled);
  await page.click('#notes-button'); await page.selectOption('#notes-week', 'week02');
  await page.locator(`.notes-index-item[data-note-id="${weekTwo.id}"]`).waitFor();
  // Phone overview and native text input, with the full note still readable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption('#notes-week', 'week01');
  await page.screenshot({ path: `${output}/mobile-board.png` });
  await page.locator(`.notes-index-item[data-note-id="${firstId}"]`).click();
  await page.screenshot({ path: `${output}/mobile-writing.png` });
  assert.ok(await page.locator('#note-text').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.click('#note-delete'); await page.click('#note-remove-no');
  assert.ok((await api()).body.notes.some(n => n.id === firstId), 'cancel removal preserves the note');
  await page.click('#note-delete'); await page.click('#note-remove-yes');
  await page.waitForFunction(() => !document.getElementById('note-dialog').open);
  assert.ok(!(await api()).body.notes.some(n => n.id === firstId));
  testIds.delete(firstId);
  await page.click('#notes-close');
  assert.equal(await page.locator('#edit-button').isVisible(), true);
  // Independent simultaneous edits merge; larger documents keep strong ETags.
  const concurrent = (await api()).body.notes.filter(n => testIds.has(n.id)).slice(0, 2);
  const updates = concurrent.map((n, i) => ({ ...n, action: 'save', text: `parallel note ${i}\n${'a longer thought. '.repeat(90)}` }));
  const writes = await Promise.all(updates.map(n => api(n)));
  assert.ok(writes.every(r => r.status === 200), JSON.stringify(writes));
  const merged = (await api()).body.notes;
  for (const update of updates) assert.equal(merged.find(n => n.id === update.id).text, update.text);
  const invalid = await api({ ...merged.find(n => n.id === updates[0].id), action: 'save', color: 'not-a-color' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ base, results: ['create', 'autosave', 'reload', 'drag', 'offline draft recovery', 'cross-browser read', 'owner-only writes', 'cross-origin rejected', 'conflict recovery', 'week separation', 'desktop and mobile', 'typing does not move camera', 'confirmed removal', 'parallel writes merge', 'larger documents', 'input validation'], errors }, null, 2));
  console.log('Weekly notes: browser, real storage, access control, and conflict checks passed.');
  await visitor.close();
} catch (error) {
  console.error('Browser failure:', error.message);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error('UI:', await page.locator('#note-save-status').textContent().catch(() => ''), await page.locator('#notes-status').textContent().catch(() => ''));
  throw error;
} finally {
  // IDs are recorded at creation, including if an assertion fails during save.
  const latest = await api();
  for (const note of latest.body.notes || []) {
    if (testIds.has(note.id)) {
      const result = await api({ action: 'delete', id: note.id, revision: note.revision });
      if (result.status !== 200) console.error('Fixture cleanup:', JSON.stringify(result));
    }
  }
  await browser.close();
}
