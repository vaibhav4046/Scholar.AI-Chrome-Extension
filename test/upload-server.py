#!/usr/bin/env python3
"""Tiny CORS-enabled file upload server for the test harness.

POST /upload/<filename>  body = raw PNG bytes  -> writes to docs/screenshots/<filename>
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import os, sys

OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/upload/"):
            self.send_response(404); self._cors(); self.end_headers(); return
        name = self.path.split("/upload/", 1)[1]
        if "/" in name or ".." in name:
            self.send_response(400); self._cors(); self.end_headers(); return
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        path = os.path.join(OUT, name)
        with open(path, "wb") as f: f.write(data)
        print(f"saved {path} ({n} bytes)", file=sys.stderr)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *a, **kw): pass

if __name__ == "__main__":
    port = 8768
    print(f"listening :{port} -> {OUT}", file=sys.stderr)
    HTTPServer(("127.0.0.1", port), H).serve_forever()
