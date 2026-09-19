#!/usr/bin/env python3
"""Build and run the separate iOS transport test app against real TLS and a scratch Pond.

Requires installed Pods and a booted simulator. Production app data is never used.
"""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
import plistlib
from pathlib import Path
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = "io.jarida.gooseonthego.transporttests"


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True, help="Booted simulator UDID")
    parser.add_argument("--derived-data", required=True)
    parser.add_argument("--pond-root", type=Path, default=ROOT.parent / "goose-in-a-pond")
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("pond_checks", args.pond_root / "scripts/test-pinned-https.py")
    pond_checks = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pond_checks)
    with tempfile.TemporaryDirectory(prefix="pond-ios-app-") as directory:
        scratch = Path(directory)
        data = scratch / "pond"
        data.mkdir()
        with (scratch / "pond.log").open("wb") as log:
            pond, http_port, https_port = pond_checks.start(data, log)
            try:
                exercise(args, scratch, data, http_port, https_port)
            finally:
                pond_checks.stop(pond)


def exercise(args, scratch, data, http_port, https_port):
    # Complete real onboarding through the loopback API; never bypass its guard.
    base = f"http://127.0.0.1:{http_port}"
    settings = json.dumps({"user_name": "Transport test", "assistant_name": "Goose",
                           "timezone": "UTC", "chat_model": "mock"}).encode()
    requests = [urllib.request.Request(base + "/api/v1/settings", data=settings, method="PUT",
                                     headers={"Content-Type": "application/json"}),
                urllib.request.Request(base + "/api/v1/onboard/complete", data=b"", method="POST")]
    for request in requests:
        with urllib.request.urlopen(request, timeout=10) as response:
            assert response.status == 200, response.status
    run("openssl", "req", "-x509", "-sha256", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
        "-pkeyopt", "ec_param_enc:named_curve", "-nodes", "-keyout", str(scratch / "key.pem"),
        "-out", str(scratch / "certificate.pem"), "-days", "1", "-subj", "/CN=pond",
        "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "extendedKeyUsage=serverAuth", "-addext", "basicConstraints=CA:FALSE")
    # Reissue with the same key and an expired validity window, retaining IP SANs.
    (scratch / "index.txt").write_text("")
    (scratch / "serial").write_text("01\n")
    (scratch / "expiry.cnf").write_text(f"""[ca]
default_ca = local
[local]
database = {scratch}/index.txt
new_certs_dir = {scratch}
serial = {scratch}/serial
default_md = sha256
policy = policy
x509_extensions = extensions
[policy]
commonName = supplied
[extensions]
subjectAltName = IP:127.0.0.1
extendedKeyUsage = serverAuth
basicConstraints = CA:FALSE
""")
    run("openssl", "req", "-new", "-key", str(scratch / "key.pem"), "-subj", "/CN=pond", "-out", str(scratch / "request.csr"))
    run("openssl", "ca", "-selfsign", "-batch", "-config", str(scratch / "expiry.cnf"),
        "-keyfile", str(scratch / "key.pem"), "-cert", str(scratch / "certificate.pem"),
        "-in", str(scratch / "request.csr"), "-out", str(scratch / "expired.pem"),
        "-startdate", "200101000000Z", "-enddate", "210101000000Z")
    public = run("openssl", "x509", "-in", str(scratch / "certificate.pem"), "-pubkey", "-noout")
    der = run("openssl", "pkey", "-pubin", "-outform", "DER", input=public)
    pin = "sha256/" + base64.b64encode(hashlib.sha256(der).digest()).decode()
    reports = []
    received = []
    report_ready = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def record(self):
            received.append(self.path)
            assert "X-Pond-Transport" not in self.headers
            assert self.headers.get("Authorization") == "Bearer scratch-fixture"

        def do_GET(self):
            self.record()
            if self.path == "/redirect":
                self.send_response(302)
                self.send_header("Location", "/captured")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream" if self.path.startswith("/api/v1/notifications/stream") else "application/json")
            self.end_headers()
            if self.path == "/lifecycle-ready":
                self.wfile.write(b"ok")
                self.wfile.flush()
                def transition():
                    time.sleep(0.5)
                    run("xcrun", "simctl", "launch", args.device, "com.apple.Preferences")
                    time.sleep(2)
                    run("xcrun", "simctl", "launch", args.device, BUNDLE)
                threading.Thread(target=transition, daemon=True).start()
            elif self.path == "/pond-config":
                base = f"http://127.0.0.1:{http_port}"
                with urllib.request.urlopen(base + "/api/v1/system/info", timeout=10) as response:
                    info = json.load(response)
                request = urllib.request.Request(base + "/api/v1/handshake/pairing-code", data=b"", method="POST")
                with urllib.request.urlopen(request, timeout=10) as response:
                    code = json.load(response)["code"]
                self.wfile.write(json.dumps({"url": f"https://127.0.0.1:{https_port}", "pin": info["tls_spki_sha256"], "code": code}).encode())
            elif self.path.startswith("/api/v1/notifications/stream"):
                for notification_id in ["first", "first", "second"]:
                    event = {"id": notification_id, "target": "scratch-phone", "category": "info", "title": "Transport test", "body": "Fixture", "timestamp": "2026-09-19T00:00:00Z"}
                    try:
                        self.wfile.write(("data: " + json.dumps(event) + "\n\n").encode())
                        self.wfile.flush()
                    except (BrokenPipeError, ssl.SSLError):
                        break
                    time.sleep(0.15)
                time.sleep(2)
            else:
                self.wfile.write(b"ok")

        def do_POST(self):
            self.record()
            assert self.path == "/report"
            size = int(self.headers.get("Content-Length", "0"))
            assert 0 < size < 64_000
            reports.append(json.loads(self.rfile.read(size)))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            report_ready.set()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(scratch / "certificate.pem", scratch / "key.pem")
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    expired_server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    expired_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    expired_context.load_cert_chain(scratch / "expired.pem", scratch / "key.pem")
    expired_server.socket = expired_context.wrap_socket(expired_server.socket, server_side=True)
    threading.Thread(target=expired_server.serve_forever, daemon=True).start()
    try:
        env = {**os.environ, "ENTRY_FILE": str(ROOT / "tests/native-ios/app-integration.tsx"),
               "EXPO_PUBLIC_POND_TEST_ORIGIN": f"https://127.0.0.1:{server.server_port}", "EXPO_PUBLIC_POND_TEST_PIN": pin,
               "EXPO_PUBLIC_POND_TEST_EXPIRED_ORIGIN": f"https://127.0.0.1:{expired_server.server_port}"}
        # Simulator Keychain requires an application identifier even for an ad-hoc build.
        # This isolated identity is never used to sign a production device binary.
        entitlements = scratch / "simulator-entitlements.plist"
        entitlements.write_bytes(plistlib.dumps({
            "application-identifier": f"PONDTEST00.{BUNDLE}",
            "keychain-access-groups": [f"PONDTEST00.{BUNDLE}"],
        }))
        print("Building the isolated iOS test app", flush=True)
        subprocess.run(["xcodebuild", "-workspace", "ios/GooseOnTheGo.xcworkspace", "-scheme", "GooseOnTheGo",
                        "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", f"id={args.device}",
                        "-derivedDataPath", args.derived_data, "CODE_SIGNING_ALLOWED=YES", "CODE_SIGN_IDENTITY=-", f"CODE_SIGN_ENTITLEMENTS={entitlements}", "ONLY_ACTIVE_ARCH=YES", f"PRODUCT_BUNDLE_IDENTIFIER={BUNDLE}", "build"],
                       cwd=ROOT, env=env, check=True)
        app = Path(args.derived_data) / "Build/Products/Release-iphonesimulator/GooseOnTheGo.app"
        # The dedicated bundle can be reset without touching a user's companion installation.
        subprocess.run(["xcrun", "simctl", "uninstall", args.device, BUNDLE], capture_output=True)
        run("xcrun", "simctl", "install", args.device, str(app))
        for phase in range(2):
            report_ready.clear()
            run("xcrun", "simctl", "launch", args.device, BUNDLE)
            if not report_ready.wait(120):
                raise AssertionError("The simulator did not report a result; inspect its test-app screen")
            for result in reports[-1]:
                print(json.dumps(result), flush=True)
            assert reports[-1] and all(result["passed"] for result in reports[-1]), reports[-1]
            if phase == 1:
                assert reports[-1][0]["name"] == "secure profile survives app restart", reports[-1]
            run("xcrun", "simctl", "terminate", args.device, BUNDLE)
        blocked = [path for path in received if path.startswith(("/wrong-", "/expired-", "/plaintext", "/cleared", "/captured")) or "wrong-pin-phone" in path]
        assert not blocked, blocked
        print("PASS native Expo fetch, RN XHR/SSE, secure persistence, scratch Pond pairing/REST/refresh/SSE and pre-HTTP rejection", flush=True)
    finally:
        subprocess.run(["xcrun", "simctl", "terminate", args.device, BUNDLE], capture_output=True)
        expired_server.shutdown()
        expired_server.server_close()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
