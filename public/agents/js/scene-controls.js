/* One environment for the sliders and the agent. No model text is evaluated. */
export const PARAMETERS = [
  { id: 'visual.water', label: 'water color', group: 'picture', type: 'color', default: '#05090f' },
  { id: 'visual.creature', label: 'creature color', group: 'picture', type: 'color', default: '#8fb4d6' },
  { id: 'visual.brightness', label: 'brightness', group: 'picture', min: 0.2, max: 1.8, step: 0.05, default: 1, unit: '×' },
  { id: 'visual.fog', label: 'view distance', group: 'picture', min: 18, max: 65, step: 1, default: 40, unit: ' m' },
  { id: 'motion.speed', label: 'motion speed', group: 'movement', min: 0, max: 2, step: 0.05, default: 1, unit: '×' },
  { id: 'motion.breathing', label: 'breathing intensity', group: 'movement', min: 0, max: 1, step: 0.05, default: 1, unit: '×' },
  { id: 'audio.ambience', label: 'water & surroundings', group: 'sound', min: 0, max: 1, step: 0.05, default: 1, unit: '×' },
  { id: 'audio.voices', label: 'singing voices', group: 'sound', min: 0, max: 1, step: 0.05, default: 1, unit: '×' },
  { id: 'audio.drone', label: 'low drone', group: 'sound', min: 0, max: 1, step: 0.05, default: 1, unit: '×' },
  { id: 'audio.rain', label: 'rain', group: 'sound', min: 0, max: 1, step: 0.05, default: 1, unit: '×' },
];

export function createSceneControls(world, sound) {
  let revision = 0;
  const history = [], listeners = new Set();
  const values = () => ({ ...world.controlValues(), ...sound.controlValues() });
  const available = p => p.group !== 'sound' || sound.state === 'on' && sound.hasControl(p.id);
  function inspect() {
    return {
      revision, values: values(),
      controls: PARAMETERS.map(p => ({ ...p, available: available(p) })),
      sound: sound.state,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      history: history.slice(-8),
      note: 'Values describe runtime settings, not a judgment of how the scene looks or sounds. Sound controls require playback; use the sound button.',
    };
  }
  function validate(id, value) {
    const p = PARAMETERS.find(p => p.id === id);
    if (!p) throw new Error(`Unknown control: ${id}. Inspect the available controls.`);
    if (!available(p)) throw new Error(`${p.label} is unavailable. Turn sound on in the website, then inspect again.`);
    if (p.type === 'color') {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('Use a six-digit hex color, for example #336677.');
      return value.toLowerCase();
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) {
      throw new Error(`${id} must be a number from ${p.min} to ${p.max}.`);
    }
    return Math.round(value * 10000) / 10000;
  }
  const apply = (id, value) => id.startsWith('audio.') ? sound.setControl(id, value) : world.setControl(id, value);
  const notify = () => listeners.forEach(fn => fn(inspect()));
  function patch(patch, actor = 'you', expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== revision) throw new Error('The scene changed since your observation. Inspect again before editing.');
    const entries = Object.entries(patch).map(([id, value]) => [id, validate(id, value)]);
    if (!entries.length) throw new Error('No parameters supplied.');
    const before = values(), after = { ...before, ...Object.fromEntries(entries) };
    try { for (const [id, value] of entries) apply(id, value); }
    catch (error) { for (const [id] of entries) apply(id, before[id]); throw error; }
    if (entries.some(([id, value]) => before[id] !== value)) {
      history.push({ before, after, actor });
      if (history.length > 40) history.shift();
      revision++;
    }
    notify();
    return inspect();
  }
  function undo(actor = 'you', expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== revision) throw new Error('The scene changed. Inspect again before undoing.');
    const previous = history.at(-1);
    if (!previous) throw new Error('Nothing to undo.');
    const current = values();
    const changed = Object.entries(previous.before).filter(([id, value]) => current[id] !== value);
    for (const [id, value] of changed) validate(id, value);
    for (const [id, value] of changed) apply(id, value);
    history.pop(); revision++; notify();
    return inspect();
  }
  // Observe on a later frame. An accepted write alone is not proof it persisted.
  async function execute(action, actor = 'agent') {
    try {
      if (action.kind === 'SET') patch({ [action.parameter]: action.value }, actor, action.revision);
      else if (action.kind === 'UNDO') undo(actor, action.revision);
      else if (action.kind !== 'INSPECT') throw new Error(`Unknown action: ${action.kind}`);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ok: true, observation: inspect() };
    } catch (error) { return { ok: false, error: error.message, observation: inspect() }; }
  }
  sound.onChange(() => notify());
  return { inspect, patch, undo, execute,
    reset() { return patch(Object.fromEntries(PARAMETERS.filter(available).map(p => [p.id, p.default]))); },
    subscribe(fn) { listeners.add(fn); fn(inspect()); return () => listeners.delete(fn); },
  };
}
