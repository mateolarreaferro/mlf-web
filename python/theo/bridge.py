"""Runs one Theo backend operation without starting its web server.

Theo's FastAPI endpoints are plain functions, so this calls them directly with
the same request models. `run` is used by api/theo-worker.py on Vercel; run as
a script it reads one JSON request on stdin, which is how `next dev` uses it.
The source in src/ is a copy made by `npm run sync:demos`; this file is not.
"""
import contextlib
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent / "src"
sys.path[:0] = [str(SRC), str(SRC / "backend")]

OPS = {
    "parse": ("parse_theo", "ParseRequest"),
    "render": ("render", "RenderRequest"),
    "generate": ("generate", "GenerateRequest"),
    "pre-generate/clarify": ("pre_generate_clarify", "PreGenClarifyRequest"),
    "clarify": ("clarify", "ClarifyRequest"),
    "clarify/answer": ("clarify_answer", "ClarifyAnswerRequest"),
    "trajectories": ("trajectories", "TrajectoriesRequest"),
}


def run(op, body):
    """Returns (status, json-able body), mirroring what the HTTP server would send."""
    if op not in OPS:
        return 404, {"detail": "Unknown operation"}
    from fastapi import HTTPException
    from pydantic import ValidationError
    # Theo logs progress with print(); keep it away from the stdout protocol.
    with contextlib.redirect_stdout(sys.stderr):
        import server
        endpoint, model = OPS[op]
        try:
            return 200, getattr(server, endpoint)(getattr(server, model)(**body))
        except ValidationError:
            return 422, {"detail": "Invalid request"}
        except HTTPException as error:
            return error.status_code, {"detail": error.detail}


if __name__ == "__main__":
    request = json.load(sys.stdin)
    status, body = run(request.get("op"), request.get("body") or {})
    json.dump({"status": status, "body": body}, sys.stdout)
