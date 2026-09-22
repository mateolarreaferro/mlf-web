import { PARAMETERS, createSceneControls } from './scene-controls.js';

export function createEditor(world, sound) {
  const controls = createSceneControls(world, sound);
  const $ = id => document.getElementById(id);
  const panel = $('scene-editor'), toggle = $('edit-button'), fields = new Map();
  let connect = () => {};
  // The static website has manual controls only. Load the agent UI exclusively
  // beside the Python server on localhost; no public placeholder or dead form.
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    void import('./local-agent.js').then(({ createLocalAgent }) => {
      connect = createLocalAgent(controls, message => { $('editor-status').textContent = message; });
      if (!panel.hidden) void connect();
    });
  }
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

  return { controls, close, get open() { return !panel.hidden; } };
}
