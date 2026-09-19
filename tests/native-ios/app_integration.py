#!/usr/bin/env python3
"""Build an isolated native transport test app against real TLS and a scratch Pond.

Supports an iOS simulator or a USB-connected Android device. Production app data
is never used. Android USB forwarding tests transport, not cellular/VPN roaming.
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
    parser.add_argument("--platform", choices=["ios", "android"], default="ios")
    parser.add_argument("--device", required=True, help="Simulator UDID or Android adb serial")
    parser.add_argument("--derived-data", help="Required for iOS builds")
    parser.add_argument("--pond-lan", action="store_true", help="Connect directly to the scratch Pond's advertised LAN address")
    parser.add_argument("--pond-root", type=Path, default=ROOT.parent / "goose-in-a-pond")
    args = parser.parse_args()
    if args.platform == "ios" and not args.derived_data:
        parser.error("--derived-data is required for iOS")
    spec = importlib.util.spec_from_file_location("pond_checks", args.pond_root / "scripts/test-pinned-https.py")
    pond_checks = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pond_checks)
    with tempfile.TemporaryDirectory(prefix="pond-native-app-") as directory:
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
    def android(*command):
        return run("adb", "-s", args.device, *command)

    def launch():
        if args.platform == "android":
            android("shell", "am", "start", "--user", "0", "-W", "-n",
                    f"{BUNDLE}/io.jarida.gooseonthego.MainActivity")
        else:
            run("xcrun", "simctl", "launch", args.device, BUNDLE)

    def terminate():
        if args.platform == "android":
            android("shell", "am", "force-stop", "--user", "0", BUNDLE)
        else:
            subprocess.run(["xcrun", "simctl", "terminate", args.device, BUNDLE], capture_output=True)

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
                    if args.platform == "android":
                        android("shell", "input", "keyevent", "KEYCODE_HOME")
                    else:
                        run("xcrun", "simctl", "launch", args.device, "com.apple.Preferences")
                    time.sleep(2)
                    launch()
                threading.Thread(target=transition, daemon=True).start()
            elif self.path == "/pond-config":
                base = f"http://127.0.0.1:{http_port}"
                with urllib.request.urlopen(base + "/api/v1/system/info", timeout=10) as response:
                    info = json.load(response)
                request = urllib.request.Request(base + "/api/v1/handshake/pairing-code", data=b"", method="POST")
                with urllib.request.urlopen(request, timeout=10) as response:
                    code = json.load(response)["code"]
                host = info.get("lan_address") if args.pond_lan else "127.0.0.1"
                assert host, "The scratch Pond has no advertised LAN address"
                self.wfile.write(json.dumps({"url": f"https://{host}:{https_port}", "pin": info["tls_spki_sha256"], "code": code}).encode())
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
    forwarded = []
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
        if args.platform == "android":
            # --no-rebind ensures this run cannot replace another task's mappings.
            # React Native resolves ENTRY_FILE relative to the app root.
            env["ENTRY_FILE"] = "tests/native-ios/app-integration.tsx"
            ports = [server.server_port, expired_server.server_port]
            if not args.pond_lan:
                ports.append(https_port)
            for port in ports:
                android("reverse", "--no-rebind", f"tcp:{port}", f"tcp:{port}")
                forwarded.append(port)
            print("Building the isolated Android test app", flush=True)
            subprocess.run(["./gradlew", "--init-script", str(ROOT / "tests/native-android/transport.init.gradle"),
                            ":app:assembleRelease", "-PreactNativeArchitectures=arm64-v8a", "--max-workers=2"],
                           cwd=ROOT / "android", env=env, check=True)
            apk = ROOT / "android/app/build/outputs/apk/release/app-release.apk"
            # The Gradle finalizer changes only this build's application ID. Validate
            # the artifact before installing so production credentials stay untouched.
            sdk = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))
            aapt = sorted((sdk / "build-tools").glob("*/aapt"))[-1]
            metadata = run(str(aapt), "dump", "badging", str(apk)).decode()
            assert metadata.startswith(f"package: name='{BUNDLE}'"), "Refusing to install a non-test APK"
            android("install", "--user", "0", "-r", str(apk))
            android("shell", "pm", "clear", "--user", "0", BUNDLE)
        else:
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
            launch()
            if not report_ready.wait(120):
                raise AssertionError("The device did not report a result; inspect its test-app screen")
            for result in reports[-1]:
                print(json.dumps(result), flush=True)
            assert reports[-1] and all(result["passed"] for result in reports[-1]), reports[-1]
            if phase == 0:
                assert any(result["name"] == "real scratch Pond pairing, authenticated REST, refresh and SSE"
                           for result in reports[-1]), "The first launch skipped the integration suite"
            else:
                assert reports[-1][0]["name"] == "secure profile survives app restart", reports[-1]
            terminate()
        blocked = [path for path in received if path.startswith(("/wrong-", "/expired-", "/plaintext", "/cleared", "/captured")) or "wrong-pin-phone" in path]
        assert not blocked, blocked
        print("PASS native Expo fetch, RN XHR/SSE, secure persistence, scratch Pond pairing/REST/refresh/SSE and pre-HTTP rejection", flush=True)
        print(f"Pond connection: {'direct LAN' if args.pond_lan else 'loopback/USB'}; cellular/VPN roaming is not exercised", flush=True)
    finally:
        terminate()
        for port in forwarded:
            subprocess.run(["adb", "-s", args.device, "reverse", "--remove", f"tcp:{port}"], capture_output=True)
        expired_server.shutdown()
        expired_server.server_close()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
