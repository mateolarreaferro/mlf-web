/* Browser adaptation of weekly_builds/week01/agent.py, without an agent framework.
 * infer() returns one model reply. This file owns memory, dispatch and stopping.
 * The Python/local version remains runnable as the tutorial's Python environment.
 */
export const MAX_DECISIONS = 12;
export const MAX_MODEL_CALLS = 1 + 2 * MAX_DECISIONS;

export function compact(observation) {
  return {
    revision: observation.revision, values: observation.values,
    sound: observation.sound, reducedMotion: observation.reducedMotion,
    controls: observation.controls.map(({ id, label, type, min, max, step, available }) =>
      ({ id, label, type, min, max, step, available })),
  };
}

export function validatePlan(plan, observation) {
  if (!plan || typeof plan.reason !== 'string' || typeof plan.blocked !== 'string' ||
      !Array.isArray(plan.targets) || !Array.isArray(plan.preserve)) throw Error('The agent returned an invalid plan.');
  const targets = {};
  for (const { parameter: id, value } of plan.targets) {
    const p = observation.controls.find(p => p.id === id);
    if (!p || Object.hasOwn(targets, id) || plan.preserve.includes(id)) throw Error('The plan conflicts with the available controls.');
    if (!p.available) throw Error(`${p.label} is unavailable. Turn sound on to edit audio.`);
    if (id.startsWith('motion.') && observation.reducedMotion) throw Error('Reduced motion is enabled in your device settings.');
    if (p.type === 'color') {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw Error('Invalid color in the plan.');
      targets[id] = value.toLowerCase();
    } else {
      const steps = (value - p.min) / p.step;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max ||
          Math.abs(steps - Math.round(steps)) > 0.00001) throw Error(`Invalid value for ${p.label}.`);
      targets[id] = Math.round(value * 10000) / 10000;
    }
  }
  for (const id of plan.preserve) {
    if (!observation.controls.some(p => p.id === id)) throw Error('Unknown preserved control.');
  }
  return { ...plan, targets };
}

export function parseAction(reply) {
  const action = typeof reply === 'string' ? JSON.parse(reply) : reply;
  if (!action || !['SET', 'INSPECT', 'UNDO', 'DONE', 'STOP'].includes(action.action)) throw Error('Invalid action. Choose one listed action.');
  if (action.action === 'SET' && (typeof action.parameter !== 'string' ||
      !(typeof action.value === 'number' && Number.isFinite(action.value) ||
        typeof action.value === 'string' && /^#[\da-f]{6}$/i.test(action.value)))) throw Error('SET needs a control and a valid value.');
  return { kind: action.action, parameter: action.parameter,
    value: typeof action.value === 'string' ? action.value.toLowerCase() : action.value, reason: action.reason ?? '' };
}

export async function runWebAgent({ controls, goal, infer, signal, emit = () => {} }) {
  let observation = compact(controls.inspect()), initial, plan, verifiedRevision = null;
  let calls = 0, status = 'limit', summary = 'Stopped at 12 turns. The goal is not verified.';
  let ownedEdits = 0;
  const messages = [], events = [];
  const log = (kind, text, extra = {}) => {
    const entry = { kind, text, at: Date.now(), ...extra }; events.push(entry); emit(entry);
  };
  const checkStop = () => { if (signal?.aborted) throw new DOMException('Stopped.', 'AbortError'); };
  const ask = async (kind, history) => {
    checkStop();
    if (calls >= MAX_MODEL_CALLS) throw Error('Model-call limit reached.');
    calls++;
    const result = await infer(kind, history, signal);
    checkStop();
    return result;
  };
  const execute = async action => {
    checkStop();
    let timer, abort;
    try {
      const result = await Promise.race([
        controls.execute({ ...action, ...(action.kind === 'INSPECT' ? {} : { revision: observation.revision }) }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('The scene did not respond. Keep this tab visible.')), 20_000);
          abort = () => reject(new DOMException('Stopped.', 'AbortError'));
          signal?.addEventListener('abort', abort, { once: true });
        }),
      ]);
      checkStop(); observation = compact(result.observation); return result;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
  const remaining = () => Object.fromEntries(Object.entries(plan.targets)
    .filter(([id, value]) => observation.values[id] !== value)
    .map(([id, value]) => [id, { current: observation.values[id], target: value }]));
  const unrequestedChanged = () => Object.keys(initial.values)
    .some(id => !Object.hasOwn(plan.targets, id) && initial.values[id] !== observation.values[id]);
  const feedback = note => `GOAL: ${goal}\nTARGETS: ${JSON.stringify(plan.targets)}\nRESULT: ${note}\nOBSERVATION: ${JSON.stringify(observation)}\nREMAINING: ${JSON.stringify(remaining())}`;
  try {
    const fresh = await execute({ kind: 'INSPECT' });
    if (!fresh.ok) throw Error('Could not read the scene.');
    initial = structuredClone(observation);
    const proposed = await ask('plan', [{ role: 'user', content: `GOAL: ${goal}\nOBSERVATION: ${JSON.stringify(initial)}` }]);
    plan = validatePlan(proposed, initial);
    log('plan', plan.reason, { plan });
    if (plan.blocked) { status = 'blocked'; summary = plan.blocked; }
    else {
      messages.push({ role: 'user', content: feedback('Apply only the planned targets. Keep all other settings unchanged.') });
      for (let step = 1; step <= MAX_DECISIONS; step++) {
        const reply = await ask('action', messages);
        messages.push({ role: 'assistant', content: JSON.stringify(reply) });
        log('model', reply.reason || reply.action, { step, raw: reply });
        let note;
        try {
          const action = parseAction(reply);
          if (action.kind === 'STOP') { status = 'blocked'; summary = action.reason || 'This change needs an unavailable control.'; break; }
          if (action.kind === 'DONE') {
            if (verifiedRevision !== observation.revision) throw Error('INSPECT after the last edit before DONE.');
            const checked = await execute({ kind: 'INSPECT' });
            if (!checked.ok || Object.keys(remaining()).length) throw Error(`Planned changes are missing: ${JSON.stringify(remaining())}`);
            if (unrequestedChanged()) { status = 'blocked'; summary = 'Another setting changed during the run. Review it and try again.'; break; }
            if (Object.keys(plan.targets).some(id => id.startsWith('audio.')) && observation.sound !== 'on') throw Error('Sound stopped. Turn sound on before verifying audio changes.');
            if (Object.keys(plan.targets).some(id => id.startsWith('motion.')) && observation.reducedMotion) throw Error('Reduced motion prevents animated playback.');
            const checkedRevision = observation.revision;
            const verdict = await ask('check', [{ role: 'user', content: JSON.stringify({ goal, plan, before: initial.values, after: observation.values }) }]);
            log('check', verdict.reason, { verdict });
            await execute({ kind: 'INSPECT' });
            if (observation.revision !== checkedRevision) { verifiedRevision = null; throw Error('The scene changed during verification. Inspect again.'); }
            if (verdict.passed === true) { status = 'complete'; summary = 'Changes applied and checked.'; break; }
            throw Error(`Goal check disagreed: ${verdict.reason}`);
          }
          if (action.kind === 'SET' && (!Object.hasOwn(plan.targets, action.parameter) || plan.targets[action.parameter] !== action.value)) throw Error('This edit is outside the plan. Only apply the remaining targets.');
          if (action.kind === 'UNDO' && (!ownedEdits || controls.inspect().history?.at(-1)?.actor !== 'agent')) throw Error('Only undo this run’s own edits.');
          const previousRevision = observation.revision;
          const result = await execute(action);
          if (result.ok) {
            if (action.kind === 'INSPECT') verifiedRevision = observation.revision;
            else if (observation.revision !== previousRevision) {
              verifiedRevision = null;
              ownedEdits += action.kind === 'UNDO' ? -1 : 1;
            }
          }
          note = result.ok ? action.kind === 'SET' ? `${action.parameter}: ${observation.values[action.parameter]}` : 'Scene inspected.' : result.error;
          log('observation', note, { action, result: { ok: result.ok, observation } });
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          note = error.message; log('error', note);
        }
        messages.push({ role: 'user', content: feedback(note) });
      }
    }
  } catch (error) {
    status = error.name === 'AbortError' ? 'cancelled' : 'error';
    summary = error.name === 'AbortError' ? 'Stopped. Applied changes can be undone.' : error.message;
  }
  log('finish', summary);
  return { id: crypto.randomUUID(), goal, status, summary, initial, final: compact(controls.inspect()), plan,
    model: 'gpt-5.1', inference: 'OpenAI via the website server', model_calls: calls, messages, events };
}
