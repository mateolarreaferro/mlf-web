// One home for the site's tools. Tabs never move the camera.
const icons = {
  search: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M7 9h10M7 13h6"/>',
  notes: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  sound: '<path d="m11 5-5 4H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  controls: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  rooms: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};
export function createWorkspace({ notes, knowledge, editor, region }) {
  const $ = id => document.getElementById(id);
  const host = document.createElement('aside'); host.id = 'workspace'; host.setAttribute('aria-label', 'agents workspace');
  host.innerHTML = '<div class="workspace-tabs" role="tablist" aria-label="workspace tools"></div><div id="workspace-content"></div>';
  $('environment').append(host);
  const toggle = document.createElement('button'); toggle.id = 'workspace-open'; toggle.className = 'pill'; toggle.textContent = 'tools'; toggle.setAttribute('aria-label', 'open tools'); toggle.setAttribute('aria-controls', 'workspace'); toggle.hidden = true; $('environment').append(toggle);
  const dismiss = document.createElement('button'); dismiss.id = 'workspace-close'; dismiss.className = 'pill'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'close tools'); host.prepend(dismiss);
  function close() {
    knowledge.close(); knowledge.clearFocus(); notes.close(); editor.close();
    notes.setHighlights(new Set(), new Set(), false);
    host.hidden = true; toggle.hidden = false; toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
  }
  dismiss.onclick = close;
  toggle.onclick = () => { activate(active || 'search'); $(ids[active]).focus(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !host.hidden && !document.querySelector('dialog[open]')) close();
  });
  const content = $('workspace-content'), tabs = host.querySelector('[role="tablist"]');
  $('environment').append($('nav-sound'));
  const panels = { search: $('knowledge-view'), notes: $('weekly-notes'), controls: $('scene-editor'), rooms: $('menu') };
  const ids = { search: 'graph-button', notes: 'notes-button', controls: 'edit-button', rooms: 'menu-button' };
  let active = null;
  function activate(name, inspect = false) {
    host.hidden = false; toggle.hidden = true; toggle.setAttribute('aria-expanded', 'true');
    if (name !== active) { knowledge.close(); notes.close(); editor.close(); }
    for (const [key, panel] of Object.entries(panels)) { panel.hidden = key !== name; $(ids[key]).setAttribute('aria-selected', String(key === name)); $(ids[key]).tabIndex = key === name ? 0 : -1; }
    active = name;
    if (name === 'search' && !inspect) knowledge.open();
    if (name === 'notes') notes.open(region());
    if (name === 'controls') editor.show();
    // Opening one tool may have closed another through the existing callbacks.
    panels[name].hidden = false;
  }
  for (const name of Object.keys(panels)) {
    const button = $(ids[name]);
    button.className = 'workspace-tab'; button.setAttribute('role', 'tab'); button.setAttribute('aria-label', name === 'search' ? 'larry' : name); button.title = name === 'search' ? 'larry' : name;
    button.setAttribute('aria-selected', 'false'); button.setAttribute('aria-controls', panels[name].id);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg><span>${name === 'search' ? 'larry' : name}</span>`;
    button.addEventListener('click', event => { event.stopImmediatePropagation(); activate(name); }, { capture: true });
    button.addEventListener('keydown', event => {
      const names = Object.keys(panels), index = names.indexOf(name);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
        activate(names[next]); $(ids[names[next]]).focus();
      }
    });
    tabs.append(button); panels[name].setAttribute('role', 'tabpanel'); panels[name].setAttribute('aria-labelledby', button.id); content.append(panels[name]);
  }
  document.querySelector('.tools').hidden = true;
  document.addEventListener('notes:inspect', () => activate('search', true));
  // Opening search is read-only; no model request until the user submits.
  activate('search');
  return { activate, close };
}
