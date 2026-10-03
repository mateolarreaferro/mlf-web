"""Private Python function behind the hosted projects' rate-limited Next routes.

One function for every project: the request names a slug, and that project's
python/<slug>/bridge.py does the work through its run(op, body).
"""
import hashlib
import hmac
import importlib.util
import json
import os
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path

PYTHON = Path(__file__).resolve().parents[1] / "python"
SLUGS = ("theo", "headwave")
bridges = {}


def bridge(slug):
    if slug not in bridges:
        spec = importlib.util.spec_from_file_location(f"{slug}_bridge", PYTHON / slug / "bridge.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        bridges[slug] = module
    return bridges[slug]


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond({"detail": "Invalid request size"}, 400)
        if not 0 < size <= 200_000:
            return self.respond({"detail": "Invalid request size"}, 400)
        body = self.rfile.read(size)
        timestamp = self.headers.get("X-Demo-Time", "")
        signature = self.headers.get("X-Demo-Signature", "")
        secret = os.getenv("DEMO_WORKER_KEY") or os.getenv("WEEKLY_NOTES_EDIT_KEY", "")
        try:
            fresh = abs(time.time() * 1000 - int(timestamp)) < 60000
        except ValueError:
            fresh = False
        # The "demo." prefix keeps this signature from being valid anywhere else.
        expected = hmac.new(secret.encode(), b"demo." + timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
        if not secret or not fresh or not hmac.compare_digest(signature, expected):
            return self.respond({"detail": "Unauthorized"}, 403)
        try:
            request = json.loads(body)
            if request.get("slug") not in SLUGS:
                return self.respond({"detail": "Unknown project"}, 404)
            status, result = bridge(request["slug"]).run(request.get("op"), request.get("body") or {})
            self.respond({"status": status, "body": result})
        except Exception:
            self.respond({"detail": "Unavailable"}, 502)

    def respond(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
