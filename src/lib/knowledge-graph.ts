import type { Note } from "./weekly-notes";

export type Evidence = { note_id: string; revision: string; quote: string; line_start: number; line_end: number; citation: string };
export type GraphNode = { id: string; label: string; kind: string; evidence: Evidence[] };
export type GraphEdge = { source: string; target: string; relation: string; basis: string; evidence: Evidence };
export type Paper = { node: string; title: string; url: string; note_id: string; status: string };
export type KnowledgeGraph = { nodes: GraphNode[]; edges: GraphEdge[]; papers: Paper[] };
export type SavedSource = { id: string; title: string; text: string; revision: string; extraction: unknown };
export type KnowledgeSnapshot = {
  version: 1;
  notes: SavedSource[];
  receipts: { id: string; query: string; result: string; urls: string }[];
  graph: KnowledgeGraph;
};
export const emptyKnowledge = (): KnowledgeSnapshot => ({ version: 1, notes: [], receipts: [], graph: { nodes: [], edges: [], papers: [] } });

// Do not display an old graph claim after its source note was edited or removed.
export function projectKnowledge(snapshot: KnowledgeSnapshot, notes: Note[]) {
  const current = new Map(notes.map(note => [note.id, note]));
  const valid = new Set(snapshot.notes.filter(note => note.extraction && current.get(note.id)?.text === note.text).map(note => note.id));
  const nodes = snapshot.graph.nodes.map(node => ({ ...node, evidence: node.evidence.filter(e => valid.has(e.note_id)) })).filter(node => node.evidence.length);
  const ids = new Set(nodes.map(node => node.id));
  const edges = snapshot.graph.edges.filter(edge => valid.has(edge.evidence.note_id) && ids.has(edge.source) && ids.has(edge.target));
  const papers = snapshot.graph.papers.filter(paper => valid.has(paper.note_id) && ids.has(paper.node));
  const pending = notes.filter(note => note.text.trim() && !valid.has(note.id));
  // Unindexed source notes are still searchable, visibly labelled as originals.
  for (const note of pending) {
    const quote = note.text.slice(0, 240);
    const end = quote.split("\n").length;
    nodes.push({ id: `note-${note.id}`, kind: "note", label: note.text.replace(/\s+/g, " ").slice(0, 100),
      evidence: [{ note_id: note.id, revision: note.revision, quote, line_start: 1, line_end: end, citation: `${note.id}:L1-L${end}` }] });
  }
  return { graph: { nodes, edges, papers }, pending: pending.length };
}
