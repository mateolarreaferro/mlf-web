"""Runs one HeadWave AI operation without its web server.

Only the assistant service comes here: everything else HeadWave's server does
(signals, camera, MIDI, OSC) happens in the visitor's browser. `run` is used by
api/demo-worker.py on Vercel; run as a script it reads one JSON request on
stdin, which is how `next dev` uses it. The source in src/ is a copy made by
`npm run sync:demos`; this file is not.
"""
import contextlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

service = None


def run(op, body):
    """Returns (status, json-able body), mirroring what HeadWave's server would send."""
    global service
    # The service logs with print(); keep it away from the stdout protocol.
    with contextlib.redirect_stdout(sys.stderr):
        if service is None:
            from src.assistant_service import AssistantService
            service = AssistantService()
        if not service.is_available():
            return 503, {"status": "error", "message": "AI service unavailable"}
        if op == "ai/generate-visual":
            if not body.get("prompt"):
                return 400, {"status": "error", "message": "No prompt provided"}
            result = service.generate_visual(
                body["prompt"],
                background_color=body.get("backgroundColor") or "#0d1117",
                previous_code=body.get("previousCode"),
                previous_prompt=body.get("previousPrompt"),
            )
        elif op in ("ai/extract-parameters", "ai/validate-code", "ai/optimize-code"):
            if not body.get("code"):
                return 400, {"status": "error", "message": "No code provided"}
            method = {"ai/extract-parameters": service.extract_parameters,
                      "ai/validate-code": service.validate_code,
                      "ai/optimize-code": service.optimize_code}[op]
            result = method(body["code"])
        else:
            return 404, {"status": "error", "message": "Unknown operation"}
    return (500 if result.get("status") == "error" else 200), result


if __name__ == "__main__":
    request = json.load(sys.stdin)
    status, body = run(request.get("op"), request.get("body") or {})
    json.dump({"status": status, "body": body}, sys.stdout)
