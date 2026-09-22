import { runWebAgent } from './web-agent-loop.js';

// Mounted only after the same-origin inference service reports that it is ready.
export function createWebAgent(controls, status) {
  const $ = id => document.getElementById(id);
  const template = document.createElement('template');
  template.innerHTML = `
    <form id="agent-form">
      <label for="agent-goal" class="sr">describe a scene change</label>
      <textarea id="agent-goal" rows="2" maxlength="1200" placeholder="Softer rain, quieter drone. Keep the voices." required></textarea>
      <div class="editor-actions"><button id="agent-submit" class="pill solid" type="submit">reshape</button><button id="agent-stop" class="pill" type="button" hidden>stop</button></div>
    </form>`;
  $('editor-status').before(template.content);
  const trace = document.createElement('details'); trace.id = 'agent-trace';
  trace.innerHTML = '<summary>agent activity</summary><ol id="agent-log"></ol><button id="agent-export" class="pill" disabled>download run</button>';
  $('scene-editor').append(trace);
  let controller = null, transcript = null;
  const infer = async (kind, messages, signal) => {
    const response = await fetch('/api/scene-agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, messages }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Agent unavailable.');
    return result.reply;
  };
  $('agent-form').addEventListener('submit', async event => {
    event.preventDefault();
    const goal = $('agent-goal').value.trim();
    if (!goal || controller) return;
    controller = new AbortController(); transcript = null;
    $('agent-form').dataset.state = 'running';
    $('agent-submit').disabled = true; $('agent-stop').hidden = false;
    $('agent-export').disabled = true; $('agent-log').replaceChildren();
    status('reading the scene…');
    transcript = await runWebAgent({ controls, goal, infer, signal: controller.signal,
      emit(entry) {
        const li = document.createElement('li'); li.textContent = entry.text; li.dataset.kind = entry.kind; $('agent-log').append(li);
        if (entry.kind === 'plan') status('shaping…');
        if (entry.kind === 'observation') {
          const p = controls.inspect().controls.find(p => p.id === entry.action?.parameter);
          status(p && entry.result.ok ? `${p.label} → ${entry.action.value}` : entry.text);
        }
        if (entry.kind === 'finish') status(entry.text);
      },
    });
    controller = null; $('agent-submit').disabled = false; $('agent-stop').hidden = true;
    $('agent-form').dataset.state = transcript.status; $('agent-export').disabled = false;
    if (transcript.status === 'blocked' && transcript.initial?.sound !== 'on' && /audio|sound|rain|drone|voice/i.test(transcript.summary)) status('Turn sound on to edit audio.');
  });
  $('agent-stop').addEventListener('click', () => { controller?.abort(); status('stopping…'); });
  $('agent-export').addEventListener('click', () => {
    if (!transcript) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `scene-agent-${transcript.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return () => {};
}
