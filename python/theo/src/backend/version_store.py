"""JSON snapshot storage for version history."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path


VERSIONS_DIR = Path(".theo-versions")


def _ensure_dir():
    VERSIONS_DIR.mkdir(exist_ok=True)


def list_versions() -> list[dict]:
    _ensure_dir()
    versions = []
    for f in sorted(VERSIONS_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            versions.append({
                "id": f.stem,
                "timestamp": data.get("timestamp", 0),
                "label": data.get("label", ""),
                "section_count": len(data.get("sections", [])),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return versions


def save_version(source: str, parsed: dict, label: str = "") -> dict:
    _ensure_dir()
    vid = str(uuid.uuid4())[:8]
    ts = time.time()
    snapshot = {
        "id": vid,
        "timestamp": ts,
        "label": label,
        "source": source,
        "parsed": parsed,
        "sections": parsed.get("sections", []),
    }
    path = VERSIONS_DIR / f"{vid}.json"
    path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return {"id": vid, "timestamp": ts, "label": label, "section_count": len(snapshot["sections"])}


def get_version(vid: str) -> dict | None:
    _ensure_dir()
    path = VERSIONS_DIR / f"{vid}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
