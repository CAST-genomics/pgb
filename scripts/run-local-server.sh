#!/bin/bash
# Serve local genome data files on port 8000 with CORS enabled.
# PGB's dev server (Vite) runs on port 5173 — this serves the large data files separately.
#
# Usage:
#   1. ./scripts/setup-local-genome.sh   (one-time symlink setup)
#   2. ./scripts/run-local-server.sh     (start data server)
#   3. npm run dev                       (start PGB app in another terminal)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$APP_ROOT"
echo "Serving PGB data from $APP_ROOT on port 8000 (CORS enabled)"
echo "Custom genome registry: http://localhost:8000/data/test-local.json"
echo ""

python3 -c "
from http.server import HTTPServer, SimpleHTTPRequestHandler

class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

HTTPServer(('', 8000), CORSHandler).serve_forever()
"
