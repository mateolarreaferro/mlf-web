"""One website request -> real smolagents loop -> durable snapshot for the site.

The Next route supplies authenticated note data and persists the resulting graph.
Temporary SQLite is a working copy, never the serverless source of truth.
"""
import contextlib
import io
import json
import re
import sys
import tempfile
from pathlib import Path

from agent import run_agent
from graph import GraphStore


def process_request(payload):
    if payload.get("action") not in {"index", "ask"}:
        raise ValueError("Unknown graph action")
    notes = payload.get("notes", [])
    if not isinstance(notes, list):
        raise ValueError("Invalid source notes")
    snapshot = payload.get("snapshot") or {}
    question = payload.get("question", "")
    if not isinstance(question, str) or len(question) > 2000:
        raise ValueError("Question too long")
    with tempfile.TemporaryDirectory(prefix="class-notes-") as directory:
        store = GraphStore(Path(directory) / "graph.sqlite3")
        saved = {n["id"]: n for n in snapshot.get("notes", [])}
        # Restore server-owned search receipts before validating saved attachments.
        with store.connect() as db:
            for receipt in snapshot.get("receipts", []):
                db.execute("INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)", (receipt["id"], receipt["query"], receipt["result"], receipt["urls"]))
        for note in notes:
            if not note["text"].strip():
                continue
            receipt = store.import_note(note["id"], note.get("week", "class") + " · " + note["text"][:65], note["text"])
            previous = saved.get(note["id"])
            if previous and previous["text"] == note["text"] and previous.get("extraction"):
                extraction = previous["extraction"]
                store.integrate(note["id"], receipt["revision"], extraction["nodes"], extraction["edges"], extraction["references"])
        pending = [n for n in store.notes() if not n["extraction"]]
        tokens = set(re.findall(r"\w+", question.lower()))
        if payload["action"] == "ask":
            pending.sort(key=lambda n: -len(tokens & set(re.findall(r"\w+", n["text"].lower()))))
        read_only = bool(payload.get("read_only")) or payload["action"] == "ask"
        required = [] if read_only else [n["id"] for n in pending[:2]]
        instruction = ""
        if required:
            instruction = "Consolidate these source notes, reusing existing concepts: " + ", ".join(required) + ". Prioritize consolidating every requested note. Reuse exact labels of genuinely shared existing concepts. Leave uncertain references unresolved; do at most one reference search in this run. "
        if payload["action"] == "index":
            task = instruction + "Trace the resulting graph, then briefly describe the connections added. If other notes remain unindexed, say so."
        else:
            task = instruction + "Choose whether this request needs tools. Answer ordinary conversation and general explanations directly. Use note retrieval and citations only for claims about the user's notes or class discussion. Use at most three short sentences and 85 words, no headings or lists. Lead with a direct, useful answer. Discuss graph structure only if asked. When proposing a new connection between notes, distinguish it from a stored source fact; omit this disclaimer in ordinary conversation. For follow-ups, resolve former/latter using the order of items in the previous USER question, not a new contrast introduced in your reply; ask a short clarification if truly ambiguous. Current question: " + question
        focus_notes = payload.get("focusNotes", [])
        if not isinstance(focus_notes, list) or len(focus_notes) > 2 or any(not isinstance(n, str) or n not in {note["id"] for note in notes} for n in focus_notes):
            raise ValueError("Invalid selected notes")
        if focus_notes:
            task += "\nThe user selected these notes: " + json.dumps(focus_notes) + ". If the question refers to this selection, read their full text with read_notes; resolve 'this note' or 'these notes' against this selection. Ignore the selection for unrelated questions, greetings, or questions about yourself."
        task += "\nWhen asked to identify a person mentioned in the class notes (not yourself), read relevant notes and class context. Never guess an identity from a name or common usage (for example a celebrity with the same name). If the notes do not establish identity, say so briefly."
        history = payload.get("history", [])
        if not isinstance(history, list) or len(history) > 6 or any(not isinstance(m, dict) or m.get("role") not in {"user", "assistant"} or not isinstance(m.get("content"), str) for m in history):
            raise ValueError("Invalid conversation")
        # Bounded dialogue context; source documents and tool results remain authoritative.
        recent = []
        budget = 2200
        for message in reversed(history[-4:]):
            if budget <= 0:
                break
            content = message["content"][:min(1500, budget)]
            recent.append({"role": message["role"], "content": content})
            budget -= len(content)
        context = json.dumps(list(reversed(recent)), ensure_ascii=False)
        if history:
            task = "Previous conversation (context, not source evidence): " + context + "\nCurrent request: " + task
        if read_only:
            task += "\nRead-only conversation: do not change the graph. Note retrieval and reference search are available if the question needs them; they are not mandatory."
        # The CLI transport emits only JSON; library progress never corrupts it.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            run = run_agent(store, task, run_dir=Path(directory) / "runs", required_notes=required, read_only=read_only)
        run.pop("database", None); run.pop("trace_file", None)
        graph = store.graph()
        with store.connect() as db:
            receipts = [dict(row) for row in db.execute("SELECT * FROM receipts")]
        used_retrieval = any(call.get("function", {}).get("name") == "trace_thought"
                             for event in run.get("events", []) for call in event.get("tool_calls", []))
        matches = store.trace(question, limit=6)["matches"] if question.strip() and used_retrieval else []
        cited = set(re.findall(r"([\w.-]+):L\d+", str(run.get("answer", ""))))
        match_ids = {m["node"]["id"] for m in matches}
        match_ids.update(n["id"] for n in graph["nodes"] if any(e["note_id"] in cited for e in n["evidence"]))
        return {"snapshot": {"version": 1, "notes": store.notes(), "receipts": receipts, "graph": graph},
                "answer": run.get("answer", ""), "matches": sorted(match_ids), "run": run}


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read(4_000_001))
        print(json.dumps(process_request(payload), ensure_ascii=False))
    except Exception:
        print(json.dumps({"error": "The Python notes agent could not complete this request."}))
        raise SystemExit(1)
