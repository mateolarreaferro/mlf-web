"""Private Python function behind the existing website's authenticated Next route."""
import hashlib
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python" / "notes_agent"))


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond({"error": "Invalid request size"}, 400)
        if not 0 < size <= 4_000_000:
            return self.respond({"error": "Invalid request size"}, 400)
        body = self.rfile.read(size)
        timestamp = self.headers.get("X-Notes-Time", "")
        signature = self.headers.get("X-Notes-Signature", "")
        secret = os.getenv("WEEKLY_NOTES_EDIT_KEY", "")
        try:
            fresh = abs(time.time() * 1000 - int(timestamp)) < 60000
        except ValueError:
            fresh = False
        expected = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
        if not secret or not fresh or not hmac.compare_digest(signature, expected):
            return self.respond({"error": "Unauthorized"}, 403)
        try:
            if os.getenv("SCENE_AGENT_API_KEY"):
                os.environ["OPENAI_API_KEY"] = os.environ["SCENE_AGENT_API_KEY"]
            from bridge import process_request
            result = process_request(json.loads(body))
            self.respond(result)
        except Exception:
            self.respond({"error": "Notes agent unavailable"}, 502)

    def respond(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
