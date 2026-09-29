"""Small provenance graph. SQLite owns persistence; model proposals are untrusted."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from collections import deque
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def normal(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Node(Strict):
    key: str = Field(min_length=1, max_length=60)
    label: str = Field(min_length=2, max_length=240)
    kind: Literal["concept", "thought", "question", "reference"]
    quote: str = Field(min_length=8, max_length=2000)


class Edge(Strict):
    source: str
    target: str
    relation: str = Field(min_length=2, max_length=100)
    basis: Literal["explicit", "inferred"]
    quote: str = Field(min_length=8, max_length=2000)


class Reference(Strict):
    node: str
    title: str = Field(min_length=2, max_length=400)
    url: str = Field(max_length=2000)
    receipt_id: str


class Extraction(Strict):
    nodes: list[Node] = Field(min_length=1, max_length=40)
    edges: list[Edge] = Field(max_length=80)
    references: list[Reference] = Field(max_length=12)


class GraphStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL,
                    revision TEXT NOT NULL, extraction TEXT);
                CREATE TABLE IF NOT EXISTS receipts (
                    id TEXT PRIMARY KEY, query TEXT NOT NULL, result TEXT NOT NULL,
                    urls TEXT NOT NULL);
            ''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def import_note(self, note_id: str, title: str, text: str):
        if not re.fullmatch(r"[\w.-]{1,100}", note_id):
            raise ValueError("Note IDs must be 1–100 letters, digits, dots, underscores or hyphens.")
        if not text.strip() or len(text) > 24000 or not title.strip() or len(title) > 240:
            raise ValueError("Supply a title (up to 240 characters) and 1–24000 characters of text.")
        revision = digest(text)
        with self.connect() as db:
            db.execute('''INSERT INTO notes VALUES (?,?,?,?,NULL)
                ON CONFLICT(id) DO UPDATE SET title=excluded.title, text=excluded.text,
                revision=excluded.revision, extraction=CASE
                    WHEN notes.revision=excluded.revision THEN notes.extraction ELSE NULL END
            ''', (note_id, title, text, revision))
        return {"note_id": note_id, "revision": revision}

    def notes(self, ids: list[str] | None = None):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM notes ORDER BY id").fetchall()
        result = []
        for row in rows:
            if ids is not None and row["id"] not in ids:
                continue
            item = dict(row)
            item["extraction"] = json.loads(item["extraction"]) if item["extraction"] else None
            result.append(item)
        return result

    @staticmethod
    def evidence(note, quote):
        offset = note["text"].find(quote)
        if offset < 0:
            raise ValueError("Evidence quote is not an exact substring of this note. Read the note again.")
        start = note["text"][:offset].count("\n") + 1
        end = start + quote.count("\n")
        return {"note_id": note["id"], "revision": note["revision"], "quote": quote,
                "line_start": start, "line_end": end,
                "citation": f'{note["id"]}:L{start}-L{end}'}

    def save_receipt(self, query, result):
        text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, default=str)
        text = text[:18000]
        urls = sorted(set(u.rstrip(".,;)") for u in re.findall(r'https?://[^\s<>"\\]+', text)))
        receipt_id = "search-" + digest(query + text)
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)",
                       (receipt_id, query, text, json.dumps(urls)))
        return {"receipt_id": receipt_id, "query": query, "result": text,
                "allowed_urls": urls, "status": "candidates_only"}

    def integrate(self, note_id, revision, nodes, edges, references):
        proposal = Extraction.model_validate({"nodes": nodes, "edges": edges, "references": references})
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if row is None:
                raise ValueError("Unknown note. Read the note index first.")
            note = dict(row)
            if note["revision"] != revision:
                raise ValueError("Stale note revision. Re-read and extract the current note.")
            keys = {n.key for n in proposal.nodes}
            if len(keys) != len(proposal.nodes):
                raise ValueError("Node keys must be unique within the note.")
            concept_labels = [normal(n.label) for n in proposal.nodes if n.kind == "concept"]
            if len(concept_labels) != len(set(concept_labels)):
                raise ValueError("Reuse one node key for each concept within a note.")
            for node in proposal.nodes:
                if not normal(node.label):
                    raise ValueError("Labels must contain words.")
                self.evidence(note, node.quote)
            for edge in proposal.edges:
                if edge.source not in keys or edge.target not in keys or edge.source == edge.target:
                    raise ValueError("Edge endpoints must be distinct node keys from this extraction.")
                self.evidence(note, edge.quote)
            for ref in proposal.references:
                node = next((n for n in proposal.nodes if n.key == ref.node), None)
                if node is None or node.kind != "reference":
                    raise ValueError("Paper candidates must attach to a reference node.")
                receipt = db.execute("SELECT urls FROM receipts WHERE id=?", (ref.receipt_id,)).fetchone()
                if not receipt or ref.url not in json.loads(receipt["urls"]):
                    raise ValueError("Paper URL must appear in a real search receipt. Search first.")
                if urlsplit(ref.url).scheme not in {"http", "https"}:
                    raise ValueError("Paper URL must use HTTP or HTTPS.")
            payload = proposal.model_dump()
            db.execute("UPDATE notes SET extraction=? WHERE id=?", (json.dumps(payload), note_id))
        attached = {r.node for r in proposal.references}
        concepts = [n.label for n in proposal.nodes if n.kind == "concept"]
        return {"status": "integrated", "note_id": note_id, "revision": revision,
                "node_count": len(proposal.nodes), "edge_count": len(proposal.edges),
                "unresolved_references": [{"key": n.key, "label": n.label, "quote": n.quote}
                    for n in proposal.nodes if n.kind == "reference" and n.key not in attached],
                "related_thoughts": self.trace(" ".join(concepts)[:500], hops=1, limit=3) if concepts else None,
                "paper_candidates": len(proposal.references)}

    def graph(self):
        nodes, edges, papers = {}, [], []
        for note in self.notes():
            extraction = note["extraction"]
            if not extraction:
                continue
            mapping = {}
            for n in extraction["nodes"]:
                # Only concepts are shared across notes; personal thoughts retain identity.
                identity = normal(n["label"]) if n["kind"] == "concept" else note["id"] + ":" + n["key"]
                node_id = n["kind"] + "-" + digest(identity)
                mapping[n["key"]] = node_id
                entry = nodes.setdefault(node_id, {"id": node_id, "label": n["label"],
                    "kind": n["kind"], "evidence": []})
                entry["evidence"].append(self.evidence(note, n["quote"]))
            for e in extraction["edges"]:
                edges.append({"source": mapping[e["source"]], "target": mapping[e["target"]],
                    "relation": e["relation"], "basis": e["basis"],
                    "evidence": self.evidence(note, e["quote"])})
            for r in extraction["references"]:
                papers.append({**r, "node": mapping[r["node"]], "note_id": note["id"], "status": "candidate"})
        return {"nodes": list(nodes.values()), "edges": edges, "papers": papers}

    def attach_reference(self, note_id, revision, node_key, receipt_id, url, title):
        ref = Reference.model_validate({"node": node_key, "receipt_id": receipt_id, "url": url, "title": title})
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            note = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if not note or note["revision"] != revision or not note["extraction"]:
                raise ValueError("Read and integrate the current note before attaching references.")
            extraction = json.loads(note["extraction"])
            if not any(n["key"] == node_key and n["kind"] == "reference" for n in extraction["nodes"]):
                raise ValueError("Use an existing reference node key from integrate_note.")
            receipt = db.execute("SELECT urls FROM receipts WHERE id=?", (receipt_id,)).fetchone()
            if not receipt or url not in json.loads(receipt["urls"]):
                raise ValueError("Copy the full receipt_id and exact allowed URL from search_references.")
            if urlsplit(url).scheme not in {"http", "https"}:
                raise ValueError("Paper URLs must use HTTP or HTTPS.")
            extraction["references"] = [r for r in extraction["references"] if (r["node"], r["url"]) != (node_key, url)]
            extraction["references"].append(ref.model_dump())
            validated = Extraction.model_validate(extraction)
            db.execute("UPDATE notes SET extraction=? WHERE id=?", (validated.model_dump_json(), note_id))
        return {"status": "candidate_attached", "note_id": note_id, "reference": ref.model_dump(),
                "caution": "Search match only; not confirmation that the author intended or read this paper."}

    def trace(self, query: str, hops: int = 2, limit: int = 6):
        if not isinstance(query, str) or not query.strip() or len(query) > 500:
            raise ValueError("Use a nonempty topical query of at most 500 characters.")
        if type(hops) is not int or not 0 <= hops <= 3 or type(limit) is not int or not 1 <= limit <= 12:
            raise ValueError("Use hops 0–3 and limit 1–12.")
        graph = self.graph()
        tokens = set(normal(query).split()) - {"the", "a", "an", "is", "to", "of", "and", "my", "how", "what", "i", "in", "does"}
        def score(n):
            label = set(normal(n["label"]).split())
            evidence = set(normal(" ".join(e["quote"] for e in n["evidence"])).split())
            return 3 * len(tokens & label) + len(tokens & evidence)
        ranked = sorted(((score(n), n) for n in graph["nodes"]), key=lambda pair: (-pair[0], pair[1]["id"]))
        seeds = [n for s, n in ranked if s > 0][:limit]
        nodes = {n["id"]: n for n in graph["nodes"]}
        matches = []
        for seed in seeds:
            queue, visited, paths = deque([(seed["id"], [])]), {seed["id"]}, []
            while queue and len(paths) < 16:
                current, path = queue.popleft()
                if len(path) >= hops:
                    continue
                for edge in graph["edges"]:
                    if current not in (edge["source"], edge["target"]):
                        continue
                    other = edge["target"] if edge["source"] == current else edge["source"]
                    if other in visited:
                        continue
                    visited.add(other)
                    next_path = path + [edge]
                    paths.append({"node": nodes[other], "path": next_path})
                    queue.append((other, next_path))
                    if len(paths) >= 16:
                        break
            matches.append({"node": seed, "score": score(seed), "connections": paths})
        selected = {m["node"]["id"] for m in matches}
        selected.update(p["node"]["id"] for m in matches for p in m["connections"])
        # Tell the model when lexical hits belong to disconnected graph regions.
        # Otherwise it may narrate a path that retrieval never actually found.
        adjacency = {node_id: set() for node_id in nodes}
        for edge in graph["edges"]:
            adjacency[edge["source"]].add(edge["target"])
            adjacency[edge["target"]].add(edge["source"])
        component, groups = {}, []
        for seed in seeds:
            if seed["id"] in component:
                continue
            group = len(groups)
            pending, members = [seed["id"]], set()
            while pending:
                current = pending.pop()
                if current in members:
                    continue
                members.add(current)
                component[current] = group
                pending.extend(adjacency[current] - members)
            groups.append({"group": group, "matching_labels": [n["label"] for n in seeds if n["id"] in members]})
        return {"query": query, "matches": matches,
                "seed_groups": groups,
                "disconnected_matches": len(groups) > 1,
                "path_guidance": "Only connections[].path contains returned paths. Different seed_groups have NO stored path between them. Label any proposed bridge as your inference, not an existing graph relationship.",
                "paper_candidates": [p for p in graph["papers"] if p["node"] in selected],
                "method": "lexical seeds + bounded graph traversal; inferred edges are not verified claims"}
