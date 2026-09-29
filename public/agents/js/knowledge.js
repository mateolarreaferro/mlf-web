import { noteConnections } from "./note-links.js";
// A view of the class site's saved notes. Inference lives in the Python agent.
const API = '/api/weekly-notes/graph';
const words = value => String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const stop = new Set(['a', 'an', 'the', 'and', 'or', 'i', 'my', 'what', 'how', 'about', 'do', 'did', 'to', 'of', 'in', 'is', 'it']);
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function createKnowledgeView({ notes, beforeOpen }) {
  const host = el('section'); host.id = 'knowledge-view'; host.hidden = true;
  host.setAttribute('aria-label', 'search class notes');
  host.innerHTML = `
    <aside id="knowledge-answer-panel" class="knowledge-answer-panel" aria-label="selected note or connection" hidden>
      <div class="knowledge-answer-heading"><h2 id="knowledge-answer-title"></h2><button id="knowledge-clear" class="pill" aria-label="back to conversation">×</button></div>
      <div id="knowledge-answer"></div><div id="knowledge-sources"></div>
    </aside>
    <section id="thread-chat">
      <div id="thread-messages" role="log" aria-label="conversation with larry" aria-live="polite"><p class="thread-welcome">Ask me a question, or type a few words to find a note.</p></div>
      <div id="knowledge-results" aria-label="matching notes" hidden></div>
      <p id="thread-context" hidden></p>
      <form id="thread-form"><label class="sr" for="thread-input">message larry</label><textarea id="thread-input" rows="2" maxlength="2000" placeholder="ask about your notes…"></textarea><button class="pill" id="thread-send" aria-label="send message" type="submit">↑</button><button class="pill" id="thread-reset" type="button" aria-label="new conversation" title="new conversation">↺</button></form>
      <p id="thread-status" role="status"></p>
    </section>
    <button id="knowledge-unfocus" class="knowledge-connection" hidden>show everything</button>
    <button id="knowledge-connect" class="knowledge-connection" hidden>connect new notes</button>`;
  document.body.append(host);
  const $ = id => host.querySelector(`#${id}`);
  let opened = false, data = { graph: { nodes: [], edges: [], papers: [] }, notes: [], canEdit: false };
  const conversation = [];
  let focusNotes = [], answerMatches = [], selectedLink = null;
  let selected = null, selectedNote = null, busy = false, requestId = 0, abort = null;


  function setMode() { $('thread-input').focus(); }
  const noteTitle = note => note?.text.trim().split('\n')[0] || 'note';
  function setContext(ids) {
    focusNotes = ids;
    $('thread-context').hidden = !ids.length;
    $('thread-context').textContent = ids.length ? 'about: ' + ids.map(id => noteTitle(notes.all.find(n => n.id === id))).join(' + ') : '';
  }
  function askAbout(ids, question) {
    setContext(ids); $('thread-input').value = question; $('thread-input').focus();
  }
  function revealSelection() { $('knowledge-answer-panel').hidden = false; $('thread-messages').hidden = true; $('knowledge-results').hidden = true; }
  function clearFocus() { selected = null; selectedNote = null; selectedLink = null; answerMatches = []; $('thread-input').value = ''; setContext([]); clearAnswer(); }
  function addMessage(role, text) {
    $('thread-messages').querySelector('.thread-welcome')?.remove(); 
    const article = el('article', undefined, `thread-message thread-${role}`);
    article.append(el('span', role === 'user' ? 'you' : 'larry', 'thread-speaker'));
    const body = el('div', text, 'thread-message-body'); article.append(body); $('thread-messages').append(article);
    article.scrollIntoView({ block: 'nearest' }); return { article, body };
  }
  function toolActivity(article, run) {
    const steps = (run?.events || []).flatMap(event => (event.tool_calls || []).map(call => ({ name: call.function?.name, failed: Boolean(event.error) }))).filter(call => call.name && call.name !== 'final_answer');
    if (!steps.length) return;
    const details = el('details', undefined, 'thread-activity'); details.append(el('summary', `${steps.length} tool calls · see what larry used`));
    const list = el('ol');
    const labels = { load_skill: 'loaded the note-consolidation skill', read_notes: 'read source notes', trace_thought: 'retrieved thoughts and graph paths', integrate_note: 'consolidated a note into the graph', search_references: 'searched paper references through MCP', attach_reference: 'attached a reference candidate' };
    for (const step of steps) list.append(el('li', `${labels[step.name] || step.name}${step.failed ? ' · encountered an error' : ''}`));
    details.append(list); article.append(details);
  }
  function status(text) { if (busy) $('thread-status').textContent = text; }
  function clearAnswer() {
    selected = null; selectedNote = null; selectedLink = null; setContext([]);
    $('knowledge-answer-panel').hidden = true; $('thread-messages').hidden = false;
    $('knowledge-sources').replaceChildren();
    highlight();
  }
  function showSource(noteId, evidence) {
    const existing = [...$('knowledge-sources').children].find(el => el.dataset.noteId === noteId);
    if (existing) return existing;
    const note = data.notes.find(n => n.id === noteId);
    if (!note) return;
    const box = el('details', undefined, 'knowledge-source');
    box.dataset.noteId = noteId;
    box.append(el('summary', note.week ? `${note.week} · source note` : note.title || noteId));
    if (evidence) box.append(el('blockquote', evidence.quote));
    box.append(el('pre', note.text.split('\n').map((line, i) => `${i + 1}  ${line}`).join('\n')));
    $('knowledge-sources').append(box);
    return box;
  }
  function choose(node) {
    $('knowledge-answer-panel').hidden = false;
    selectedNote = null; selected = node.id;
    $('knowledge-answer-title').textContent = node.label;
    $('knowledge-answer').replaceChildren(el('p', node.kind === 'note' ? 'original note · not yet connected' : node.kind, 'knowledge-hint'));
    $('knowledge-sources').replaceChildren(); $('knowledge-clear').hidden = false;
    for (const evidence of node.evidence) {
      $('knowledge-answer').append(el('blockquote', evidence.quote));
      const source = el('button', evidence.citation, 'knowledge-citation');
      source.onclick = () => { const box = showSource(evidence.note_id, evidence); if (box) box.open = true; };
      $('knowledge-answer').append(source);
    }
    for (const edge of data.graph.edges.filter(e => e.source === node.id || e.target === node.id)) {
      const other = data.graph.nodes.find(n => n.id === (edge.source === node.id ? edge.target : edge.source));
      if (!other) continue;
      const button = el('button', `${edge.relation} · ${other.label}${edge.basis === 'inferred' ? ' · inferred' : ''}`, 'knowledge-connection');
      button.onclick = () => choose(other); $('knowledge-answer').append(button);
    }
    for (const paper of data.graph.papers.filter(p => p.node === node.id)) {
      if (!/^https?:\/\//.test(paper.url)) continue;
      const link = el('a', `${paper.title} ↗ · possible reference`, 'knowledge-connection');
      link.href = paper.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('knowledge-answer').append(link);
    }
    highlight();
  }
  function highlight(forced) {
    const query = words($('thread-input').value).filter(w => !stop.has(w));
    const matches = new Set(forced || (!query.length && answerMatches.length ? answerMatches : data.graph.nodes.filter(node => {
      const original = node.kind === 'note' ? data.notes.find(n => n.id === node.evidence[0]?.note_id)?.text || '' : '';
      const text = words(node.label + ' ' + node.evidence.map(e => e.quote).join(' ') + ' ' + original);
      return query.length && query.some(word => text.some(token => token.startsWith(word)));
    }).map(node => node.id)));
    if (selected) matches.add(selected);
    const nearby = new Set();
    for (const edge of data.graph.edges) {
      if (matches.has(edge.source)) nearby.add(edge.target);
      if (matches.has(edge.target)) nearby.add(edge.source);
    }
    const active = query.length > 0 || Boolean(selected) || Boolean(selectedNote) || Boolean(selectedLink) || Boolean(forced?.length) || Boolean(answerMatches.length);
    const noteIds = new Set(), relatedIds = new Set();
    for (const node of data.graph.nodes) for (const evidence of node.evidence) {
      if (matches.has(node.id)) noteIds.add(evidence.note_id);
      else if (nearby.has(node.id)) relatedIds.add(evidence.note_id);
    }
    // Search full original text too: indexing is not required to find a note.
    if (!forced) for (const note of notes.all) {
      const tokens = words(note.text);
      if (query.length && query.some(word => tokens.some(token => token.startsWith(word)))) noteIds.add(note.id);
    }
    if (selectedNote) noteIds.add(selectedNote);
    if (selectedLink) { noteIds.add(selectedLink.source); noteIds.add(selectedLink.target); }
    notes.setHighlights(noteIds, relatedIds, opened && active);
    $('knowledge-unfocus').hidden = !active;
    const results = $('knowledge-results'); results.replaceChildren();
    const ranked = notes.all.map(note => {
      const tokens = words(note.text), titleTokens = words(noteTitle(note));
      const hits = query.filter(word => tokens.some(token => token.startsWith(word))).length;
      return { note, score: hits + query.filter(word => titleTokens.some(token => token.startsWith(word))).length * 3 };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    results.hidden = !query.length || query.length > 5 || busy;
    if (!results.hidden) {
      if (!ranked.length) results.append(el('p', 'No matching note. Send your question to ask Larry.', 'knowledge-hint'));
      for (const {note} of ranked) {
        const button = el('button', noteTitle(note), 'knowledge-result'); button.onclick = () => { $('thread-input').value = ''; inspectNote(note, true); }; results.append(button);
      }
    }
    if (!busy) status(active ? `${noteIds.size} ${noteIds.size === 1 ? 'note' : 'notes'} highlighted${query.length && !noteIds.size ? ' · try another phrase' : ' · click a card to read'}` : 'search to light up your notes · enter to ask');
  }
  function draw() {
    notes.setGraph(data.graph);
    $('knowledge-connect').hidden = !data.canEdit || !data.pending;
    highlight();
  }
  function inspectLink(link) {
    document.dispatchEvent(new Event('notes:inspect'));
    opened = true; host.hidden = false; selected = null; selectedNote = null; selectedLink = link;
    revealSelection(); setContext([link.source, link.target]);
    $('knowledge-answer-title').textContent = link.inferred ? 'a possible connection' : 'why these notes connect';
    $('knowledge-answer').replaceChildren(); $('knowledge-sources').replaceChildren();
    const reason = link.reasons.find(r => r.basis === 'shared') || link.reasons[0];
    const explanation = reason.basis === 'shared' ? `Both notes discuss ${reason.label.replace('shared thought · ', '')}.` : reason.label.replaceAll(' → ', ' ') + '.';
    $('knowledge-answer').append(el('p', explanation));
    if (link.inferred) $('knowledge-answer').append(el('p', 'This relationship is inferred, not explicitly stated in the notes.', 'knowledge-hint'));
    for (const id of [link.source, link.target]) {
      const note = notes.all.find(n => n.id === id); if (!note) continue;
      const box = el('section', undefined, 'connection-evidence');
      const button = el('button', noteTitle(note), 'knowledge-connection'); button.onclick = () => inspectNote(note, true); box.append(button);
      const quote = link.reasons.flatMap(r => r.evidence).find(e => e.note_id === id)?.quote;
      if (quote) box.append(el('blockquote', quote));
      $('knowledge-sources').append(box);
    }
    const askButton = el('button', 'ask larry about this connection', 'knowledge-connection');
    askButton.onclick = () => askAbout([link.source, link.target], 'What can I learn from the connection between these notes?'); $('knowledge-sources').append(askButton);
    notes.setHighlights(new Set([link.source, link.target]), new Set(), true); $('knowledge-unfocus').hidden = false;
  }
  function inspectNote(note, navigate = false) {
    document.dispatchEvent(new Event('notes:inspect'));
    selected = null; selectedLink = null; selectedNote = note.id;
    if (!opened) { opened = true; host.hidden = false; document.getElementById('graph-button').setAttribute('aria-expanded', 'true'); void load(); }
    revealSelection(); setContext([note.id]);
    $('knowledge-answer-title').textContent = noteTitle(note);
    $('knowledge-answer').replaceChildren(el('p', note.text.split('\n').slice(1).join('\n').trim() || note.text)); $('knowledge-sources').replaceChildren();
    const links = noteConnections(data.graph, notes.all).filter(link => link.source === note.id || link.target === note.id);
    if (links.length) {
      $('knowledge-sources').append(el('p', 'connected notes', 'knowledge-hint'));
      for (const link of links) {
        const other = notes.all.find(n => n.id === (link.source === note.id ? link.target : link.source));
        const button = el('button', noteTitle(other), 'knowledge-connection'); button.onclick = () => inspectLink(link); $('knowledge-sources').append(button);
      }
    }
    const askButton = el('button', 'ask larry about this note', 'knowledge-connection'); askButton.onclick = () => askAbout([note.id], 'What is the key idea in this note?'); $('knowledge-sources').append(askButton);
    notes.setHighlights(new Set([note.id]), new Set(), true); $('knowledge-unfocus').hidden = false;
    if (navigate) notes.focusNote(note.id);
  }
  let loadId = 0;
  async function load() {
    const id = ++loadId; status('loading your notes…');
    try {
      const response = await fetch(API, { cache: 'no-store' });
      if (!response.ok) throw Error('Your graph could not load. Try again.');
      const result = await response.json();
      if (id !== loadId) return;
      data = result; draw();
    } catch (error) { status(error.message); }
  }
  function renderAnswer(answer, box = $('knowledge-answer')) {
    box.replaceChildren();
    const pattern = /([\w.-]+):L(\d+)(?:-L?(\d+))?/g;
    let start = 0; const cited = new Set();
    for (const match of answer.matchAll(pattern)) {
      box.append(document.createTextNode(answer.slice(start, match.index)));
      const note = data.notes.find(n => n.id === match[1]);
      const title = note?.text.trim().split('\n')[0] || match[1];
      const button = el('button', `${title.slice(0, 38)}${title.length > 38 ? '…' : ''} · ${match[2]}${match[3] ? '–' + match[3] : ''}`, 'knowledge-citation');
      button.title = match[0];
      button.onclick = () => { const source = notes.all.find(n => n.id === match[1]); if (source) inspectNote(source, true); };

      box.append(button); start = match.index + match[0].length; cited.add(match[1]);
    }
    box.append(document.createTextNode(answer.slice(start)));
    if (box === $('knowledge-answer')) for (const id of cited) showSource(id);
  }
  async function ask(action, chatQuestion = null) {
    if (busy) return;
    const isChat = true;
    const question = chatQuestion !== null ? chatQuestion.trim() : $('thread-input').value.trim();
    if (action === 'ask' && !question) return $('thread-input').focus();
    $('knowledge-answer-panel').hidden = false;
    $('knowledge-answer-title').textContent = action === 'index' ? 'connecting your notes' : question;
    $('knowledge-sources').replaceChildren(); $('knowledge-clear').hidden = false;
    if (action === 'index' && !data.canEdit) {
      $('knowledge-answer').replaceChildren(el('p', 'You can explore the highlighted sources. Sign in through notes to ask the agent.', 'knowledge-hint'));
      return;
    }
    const history = conversation.slice(-6).map(message => ({ ...message, content: message.content.slice(0, 1500) }));
    let reply;
    if (isChat) {
      $('knowledge-answer-panel').hidden = true; $('thread-messages').hidden = false; $('knowledge-results').hidden = true;
      addMessage('user', question); reply = addMessage('assistant', 'Thinking…'); $('thread-input').value = '';
    }
    $('thread-status').textContent = ''; $('thread-send').disabled = true; $('thread-reset').disabled = true;
    document.dispatchEvent(new CustomEvent('thread:state', { detail: 'thinking' }));
    busy = true; $('thread-send').disabled = true; $('knowledge-connect').disabled = true;
    $('knowledge-answer').textContent = action === 'index' ? 'Reading your saved notes and finding connections…' : 'Following your notes and their connections…';
    status('');
    const id = ++requestId; abort = new AbortController();
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, question, history: isChat ? history : [], focusNotes }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'The answer could not be completed.');
      if (id !== requestId) return;
      data = { ...data, ...result }; selected = null; selectedNote = null; selectedLink = null; answerMatches = opened ? result.matches || [] : []; draw();
      $('knowledge-sources').replaceChildren();
      answerMatches = opened ? result.matches || [] : [];
      const answer = result.answer || 'Your notes are connected.';
      if (isChat) {
        renderAnswer(answer, reply.body); toolActivity(reply.article, result.run);
        conversation.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
        $('thread-status').textContent = '';
      } else renderAnswer(answer);
      highlight(isChat || $('thread-input').value.trim() === question ? result.matches : undefined);
      $('knowledge-answer-title').textContent = action === 'index' ? 'connections added' : question;
    } catch (error) {
      if (error.name !== 'AbortError' && id === requestId) { (reply?.body || $('knowledge-answer')).textContent = error.message; $('thread-status').textContent = 'could not finish · try sending your question again'; }
    } finally {
      if (id === requestId) { $('thread-send').disabled = false; $('thread-reset').disabled = false; document.dispatchEvent(new CustomEvent('thread:state', { detail: 'idle' })); busy = false; abort = null; $('thread-send').disabled = false; $('knowledge-connect').disabled = false; status('select a thought to inspect its source'); }
    }
  }
  function open() {
    if (opened) return;
    beforeOpen(); opened = true; host.hidden = false;
    document.getElementById('graph-button').setAttribute('aria-expanded', 'true');
    $('thread-input').focus(); void load();
  }
  function close() {
    if (!opened) return;
    opened = false; host.hidden = true;
    notes.setHighlights(new Set(), new Set(), false);
    document.getElementById('graph-button').setAttribute('aria-expanded', 'false');
    document.getElementById('graph-button').focus();
    // Leaving the view does not cancel a write already accepted by the server.
  }
  $('thread-form').onsubmit = event => { event.preventDefault(); const question = $('thread-input').value.trim(); if (question) void ask('ask', question); };
  $('thread-input').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('thread-form').requestSubmit(); } };
  let searchTimer;
  $('thread-input').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { selected = null; selectedNote = null; selectedLink = null; answerMatches = []; highlight(); }, 180); });
  $('thread-reset').onclick = () => { if (busy) return; conversation.length = 0; $('thread-messages').replaceChildren(el('p', 'Ask me a question, or type a few words to find a note.', 'thread-welcome')); $('thread-status').textContent = ''; clearFocus(); };
  $('knowledge-clear').onclick = clearAnswer;
  $('knowledge-unfocus').onclick = clearFocus;
  $('knowledge-connect').onclick = () => void ask('index');
  document.addEventListener('notes:read', event => { const note = notes.all.find(n => n.id === event.detail); if (note) inspectNote(note); });
  return { open, close, clearFocus, inspectNote, inspectLink, talk() { document.dispatchEvent(new Event('notes:inspect')); open(); setMode('chat'); }, get opened() { return opened; } };
}
