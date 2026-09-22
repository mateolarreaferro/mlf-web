// Loaded only on localhost. Python + Ollama must run beside this browser.
export function createLocalAgent(controls, status) {
  const $ = id => document.getElementById(id);
  const template = document.createElement('template');
  template.innerHTML = `      <form id="agent-form">
        <label for="agent-goal" class="sr">describe a scene change</label>
        <textarea id="agent-goal" rows="2" maxlength="1200" placeholder="Make the rain softer. Keep the voices." required></textarea>
        <div class="editor-actions"><button id="agent-submit" class="pill solid" type="submit" disabled>reshape</button><button id="agent-stop" class="pill" type="button" hidden>stop</button><span id="agent-connection" class="editor-note">local agent</span></div>
      </form>
      <div id="agent-setup" class="editor-note"><p><code>python3 weekly_builds/week01/server.py</code><br><a href="http://127.0.0.1:8766/">Open local agent</a></p><button id="agent-connect" class="pill">reconnect</button></div>
      <details id="agent-trace"><summary>agent activity</summary><ol id="agent-log"></ol><button id="agent-export" class="pill" disabled>download run</button></details>`;
  $('editor-status').before(template.content);
  $('agent-trace').removeAttribute('open');
  let run = null, bridge = false, seen = 0, lastAction = null, stopped = false, transcript = null;
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
    if (run) return;
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
  return connect;
}
