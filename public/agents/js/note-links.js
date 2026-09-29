// Project the evidenced concept graph onto original notes. No proximity links.
export function noteConnections(graph, notes) {
  const valid = new Map(notes.map(n => [n.id, n]));
  const owners = new Map();
  for (const node of graph.nodes || []) owners.set(node.id, [...new Set((node.evidence || [])
    .filter(e => valid.has(e.note_id) && valid.get(e.note_id).text.includes(e.quote))
    .map(e => e.note_id))]);
  const nodes = new Map((graph.nodes || []).map(n => [n.id, n]));
  const pairs = new Map();
  function add(a, b, reason) {
    if (a === b) return;
    const [source, target] = [a, b].sort(), id = JSON.stringify([source, target]);
    if (!pairs.has(id)) pairs.set(id, { id, source, target, reasons: [] });
    const link = pairs.get(id);
    if (!link.reasons.some(r => r.label === reason.label && r.basis === reason.basis)) link.reasons.push(reason);
  }
  for (const node of graph.nodes || []) {
    const ids = owners.get(node.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      add(ids[i], ids[j], { label: `shared thought · ${node.label}`, basis: 'shared', evidence: node.evidence.filter(e => [ids[i], ids[j]].includes(e.note_id) && valid.get(e.note_id).text.includes(e.quote)) });
    }
  }
  for (const edge of graph.edges || []) {
    if (!valid.get(edge.evidence?.note_id)?.text.includes(edge.evidence.quote)) continue;
    for (const a of owners.get(edge.source) || []) for (const b of owners.get(edge.target) || []) {
      add(a, b, { label: `${nodes.get(edge.source).label} → ${edge.relation} → ${nodes.get(edge.target).label}`, basis: edge.basis, evidence: [edge.evidence, ...nodes.get(edge.source).evidence, ...nodes.get(edge.target).evidence].filter(e => [a, b].includes(e.note_id) && valid.get(e.note_id)?.text.includes(e.quote)) });
    }
  }
  return [...pairs.values()].map(link => ({ ...link, inferred: link.reasons.every(r => r.basis === 'inferred') }));
}
