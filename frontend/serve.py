"""Dev static server for SmartExpenses AI with caching disabled.

Usage (from the frontend folder):
    python serve.py

Serves the current directory on http://127.0.0.1:5500 and tells the browser
never to cache anything, so edits always show up on a normal reload.
"""

import http.server
import socketserver

PORT = 5500
HOST = "127.0.0.1"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableTCPServer((HOST, PORT), NoCacheHandler) as httpd:
        print("SmartExpenses AI dev server (no-cache) -> http://%s:%d" % (HOST, PORT))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
