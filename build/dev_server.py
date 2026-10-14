"""Потоковый статический dev-сервер (no-cache) для project3.
Отличие от engine nocache-server.py: ThreadingHTTPServer — Chrome грузит
десятки <script> параллельными соединениями, однопоточный TCPServer ронял
часть запросов (скрипт молча не выполнялся → «createAssets is not defined»).
POST /save для редактора сохранён (совместимость).
"""
import base64
import json
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SPRITES_DIR = ROOT / "images" / "sprites"
SAFE_NAME = re.compile(r"^[\w\-]+\.(png|json)$")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/save":
            self._json(404, {"error": "unknown endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            name = payload.get("name", "")
            data = payload.get("data", "")
            if not SAFE_NAME.match(name):
                self._json(400, {"error": "bad name"})
                return
            base64_data = data.split(",", 1)[-1]
            SPRITES_DIR.mkdir(parents=True, exist_ok=True)
            target = SPRITES_DIR / name
            target.write_bytes(base64.b64decode(base64_data))
            self._json(200, {"saved": f"images/sprites/{name}", "bytes": target.stat().st_size})
        except Exception as error:  # noqa: BLE001
            self._json(500, {"error": str(error)})


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8147
    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"Serving on http://127.0.0.1:{port} (threaded, no-cache)")
        server.serve_forever()
