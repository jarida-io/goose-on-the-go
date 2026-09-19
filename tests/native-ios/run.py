#!/usr/bin/env python3
"""Run the iOS transport's Foundation/Security core on macOS against real TLS.

This does not replace an Xcode iOS build or physical-device acceptance.
"""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import ssl
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs).stdout


def main():
    with tempfile.TemporaryDirectory(prefix="pond-apple-tls-") as directory:
        scratch = Path(directory)
        run("openssl", "req", "-x509", "-sha256", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-pkeyopt", "ec_param_enc:named_curve", "-nodes",
            "-keyout", str(scratch / "key.pem"), "-out", str(scratch / "certificate.pem"), "-days", "1",
            "-subj", "/CN=pond", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "extendedKeyUsage=serverAuth", "-addext", "basicConstraints=CA:FALSE")
        run("openssl", "req", "-new", "-x509", "-sha256", "-key", str(scratch / "key.pem"), "-out", str(scratch / "renewed.pem"),
            "-days", "365", "-subj", "/CN=pond", "-addext", "subjectAltName=IP:127.0.0.1,DNS:pond.local", "-addext", "extendedKeyUsage=serverAuth", "-addext", "basicConstraints=CA:FALSE")
        for name in ["certificate", "renewed"]:
            run("openssl", "x509", "-in", str(scratch / f"{name}.pem"), "-outform", "DER", "-out", str(scratch / f"{name}.der"))
        public = run("openssl", "x509", "-in", str(scratch / "certificate.pem"), "-pubkey", "-noout")
        der = run("openssl", "pkey", "-pubin", "-outform", "DER", input=public)
        (scratch / "pin.txt").write_text("sha256/" + base64.b64encode(hashlib.sha256(der).digest()).decode())
        received = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                received.append(self.path)
                assert "X-Pond-Transport" not in self.headers
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/captured")
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream" if self.path in ["/sse", "/hold"] else "text/plain")
                self.end_headers()
                self.wfile.write(b"data: first\n\n")
                self.wfile.flush()
                if self.path == "/sse":
                    time.sleep(0.1)
                    self.wfile.write(b"data: second\n\n")
                elif self.path == "/hold":
                    time.sleep(2)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(scratch / "certificate.pem", scratch / "key.pem")
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-parse-as-library",
                            str(ROOT / "plugins/pond-tls/ios/PondCertificate.swift"),
                            str(ROOT / "plugins/pond-tls/ios/PondURLProtocol.swift"),
                            str(ROOT / "tests/native-ios/TransportTests.swift"), "-o", str(scratch / "test")], check=True)
            subprocess.run([str(scratch / "test"), directory, f"https://127.0.0.1:{server.server_port}"], check=True, timeout=60)
            assert received == ["/fetch", "/xhr", "/sse", "/redirect", "/hold"], received
            print("PASS rejected requests sent no HTTP headers; redirect destination was not contacted")
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
