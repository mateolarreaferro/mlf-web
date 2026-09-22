import { PARAMETERS, createSceneControls } from './scene-controls.js';

export function createEditor(world, sound) {
  const controls = createSceneControls(world, sound);
  const $ = id => document.getElementById(id);
  const panel = $('scene-editor'), toggle = $('edit-button'), fields = new Map();
  const localAgent = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('agent-form').hidden = !localAgent;
  $('agent-trace').hidden = !localAgent;
  let run = null, bridge = false, seen = 0, lastAction = null, stopped = false, transcript = null;
  const presetsKey = 'agents-scene-presets-v1';
  let presets = {};
  try { presets = JSON.parse(localStorage.getItem(presetsKey)) || {}; } catch {}
  if (typeof presets !== 'object' || Array.isArray(presets)) presets = {};
  const status = message => { $('editor-status').textContent = message; };
  const format = (p, value) => p.type === 'color' ? value : `${Number(value.toFixed(2))}${p.unit ?? ''}`;

  for (const group of ['picture', 'movement', 'life', 'sound']) {
    const section = document.createElement('details'); section.open = group !== 'sound';
    const summary = document.createElement('summary'); summary.textContent = ({ picture: 'shape', movement: 'movement', life: 'life', sound: 'satie mixer' })[group]; section.append(summary);
    for (const p of PARAMETERS.filter(p => p.group === group)) {
      const row = document.createElement('div'); row.className = 'scene-control';
      const label = document.createElement('label'); label.htmlFor = `control-${p.id}`; label.textContent = p.label;
      const output = document.createElement('output'); output.htmlFor = label.htmlFor;
      const input = document.createElement('input'); input.id = label.htmlFor; input.type = p.type === 'color' ? 'color' : 'range';
      if (p.type !== 'color') { input.min = p.min; input.max = p.max; input.step = p.step; }
      let gesture;
      input.addEventListener('pointerdown', () => { gesture = crypto.randomUUID(); });
      input.addEventListener('change', () => { gesture = undefined; });
      input.addEventListener('input', () => {
        try { controls.patch({ [p.id]: p.type === 'color' ? input.value : Number(input.value) }, 'you', undefined, gesture); status(`${p.label} changed`); }
        catch (error) { status(error.message); }
      });
      row.append(label, output, input); section.append(row); fields.set(p.id, { input, output });
    }
    if (group === 'sound') {
      const note = document.createElement('p'); note.id = 'editor-sound-note'; note.className = 'editor-note'; section.append(note);
    }
    $('scene-fields').append(section);
  }
  controls.subscribe(observation => {
    for (const p of observation.controls) {
      const { input, output } = fields.get(p.id);
      input.value = observation.values[p.id]; input.disabled = !p.available;
      output.textContent = format(p, observation.values[p.id]);
    }
    $('scene-undo').disabled = observation.history.length === 0;
    $('editor-sound-note').textContent = observation.sound === 'on' ? '1× = original level' : 'Turn sound on to edit.';
  });
  function close() {
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    delete document.documentElement.dataset.editing; toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); document.documentElement.dataset.editing = '';
    $('editor-close').focus({ preventScroll: true }); void connect();
  });
  $('editor-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  for (const [id, fn] of [['scene-undo', () => controls.undo()], ['scene-reset', () => controls.reset()]]) {
    $(id).addEventListener('click', () => { try { fn(); status(id === 'scene-undo' ? 'last edit undone' : 'available controls reset'); } catch (error) { status(error.message); } });
  }
  function refreshPresets() {
    const select = $('scene-presets'); select.replaceChildren(new Option('choose a saved scene', ''));
    for (const name of Object.keys(presets)) select.add(new Option(name, name));
  }
  refreshPresets();
  $('scene-save').addEventListener('click', () => {
    const name = $('scene-name').value.trim().slice(0, 48);
    if (!name) { status('Give your scene a name first.'); $('scene-name').focus(); return; }
    const next = { ...presets, [name]: controls.inspect().values };
    if (Object.keys(next).length > 12) { status('Twelve scenes are saved. Use an existing name to replace one.'); return; }
    try { localStorage.setItem(presetsKey, JSON.stringify(next)); presets = next; refreshPresets(); $('scene-presets').value = name; status('scene saved in this browser'); }
    catch { status('This browser could not save the scene.'); }
  });
  $('scene-presets').addEventListener('change', () => {
    const name = $('scene-presets').value; if (!name) return;
    try {
      const current = controls.inspect().values;
      const patch = Object.fromEntries(Object.entries(presets[name]).filter(([id, value]) => current[id] !== value));
      if (Object.keys(patch).length) controls.patch(patch);
      $('scene-name').value = name; status(`${name} restored`);
    } catch (error) { status(error.message); }
  });

  const api = async (path, body) => {
    const response = await fetch(new URL(`agent-api/${path}`, document.baseURI), {
      method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Local agent returned ${response.status}.`);
    return result;
  };
  async function connect() {
    if (run || !localAgent) return;
    bridge = false;
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      try { const result = await api('status'); bridge = result.ready; $('agent-connection').textContent = bridge ? `${result.model} · running locally` : result.message; }
      catch { $('agent-connection').textContent = 'Start the local server.'; }
    } else $('agent-connection').textContent = 'Agent requires local server.';
    $('agent-setup').hidden = bridge; $('agent-submit').disabled = !bridge;
  }
  $('agent-connect').addEventListener('click', connect);
  $('agent-form').addEventListener('submit', async event => {
    event.preventDefault();
    const goal = $('agent-goal').value.trim(); if (!goal || run || !bridge) return;
    $('agent-submit').disabled = true;
    try {
      const result = await api('start', { goal, observation: controls.inspect() });
      run = result.id; seen = 0; lastAction = null; stopped = false; transcript = null;
      $('agent-log').replaceChildren(); $('agent-trace').open = true;
      $('agent-stop').hidden = false; $('agent-stop').disabled = false; $('agent-export').disabled = true;
      status('agent is reading the scene…'); void poll();
    } catch (error) { status(error.message); $('agent-submit').disabled = !bridge; }
  });
  $('agent-stop').addEventListener('click', async () => {
    if (!run) return;
    stopped = true; $('agent-stop').disabled = true;
    try { await api(`runs/${run}/cancel`, {}); status('stopped; applied edits remain available to undo'); }
    catch (error) { status(error.message); }
  });
  async function poll() {
    const id = run;
    try {
      const snapshot = await api(`runs/${id}`);
      for (const entry of snapshot.events.slice(seen)) {
        const li = document.createElement('li'); li.textContent = entry.text; li.dataset.kind = entry.kind; $('agent-log').append(li);
      }
      seen = snapshot.events.length;
      if (snapshot.action && snapshot.action.id !== lastAction && !stopped) {
        const action = snapshot.action; lastAction = action.id;
        const result = await controls.execute(action);
        await api(`runs/${id}/result`, { id: action.id, ...result });
      }
      if (snapshot.status !== 'running') {
        transcript = snapshot; run = null; status(snapshot.summary); $('agent-stop').hidden = true;
        $('agent-submit').disabled = !bridge; $('agent-export').disabled = false; return;
      }
      setTimeout(poll, 250);
    } catch (error) {
      // Never replay a mutation after an ambiguous transport error.
      try { await api(`runs/${id}/cancel`, {}); } catch {}
      run = null; status(`Agent disconnected: ${error.message}`); $('agent-stop').hidden = true; $('agent-submit').disabled = !bridge;
    }
  }
  $('agent-export').addEventListener('click', () => {
    if (!transcript) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `scene-agent-${transcript.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { controls, close, get open() { return !panel.hidden; } };
}
