#!/usr/bin/env bash
# Build embedded Pond networking (pondnet.aar / Pondnet.xcframework), prebuild native projects,
# and deploy release builds to present Android/iOS devices (or specific --device targets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: scripts/release-build.sh [-a] [-i] [--device <id>]...

Options:
  -a, --android        Build and deploy Android release
  -i, --ios            Build and deploy iOS release
      --device <id>    Target a specific device identifier (ADB serial or iOS UDID/name);
                       may be passed multiple times. Defaults to all present devices.
  -h, --help           Show this help

With neither -a nor -i, builds and deploys both Android and iOS.
EOF
}

want_android=false
want_ios=false
devices=()

while [ $# -gt 0 ]; do
  case "$1" in
    -a|--android) want_android=true ;;
    -i|--ios) want_ios=true ;;
    --device)
      shift
      [ $# -gt 0 ] || { echo "Missing value for --device" >&2; exit 2; }
      devices+=("$1")
      ;;
    --device=*)
      devices+=("${1#--device=}")
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! $want_android && ! $want_ios; then
  want_android=true
  want_ios=true
fi

matches_filter() {
  local id="$1"
  local label="${2:-}"
  if [ ${#devices[@]} -eq 0 ]; then
    return 0
  fi
  local d
  for d in "${devices[@]}"; do
    if [ "$d" = "$id" ] || [ -n "$label" ] && [ "$d" = "$label" ]; then
      return 0
    fi
  done
  return 1
}

if $want_android; then
  echo "==> [Android] Building embedded network (pondnet.aar)"
  bash scripts/build-embedded-network.sh android

  echo "==> [Android] Prebuilding native project"
  npx expo prebuild --platform android --clean

  if [ -f android/gradle.properties ]; then
    sed -i '' 's/-Xmx2048m -XX:MaxMetaspaceSize=512m/-Xmx4096m -XX:MaxMetaspaceSize=1024m/' android/gradle.properties || true
  fi

  echo "==> [Android] Assembling release APK"
  (cd android && ./gradlew app:assembleRelease -x lint -x test --configure-on-demand --build-cache)

  apk="android/app/build/outputs/apk/release/app-release.apk"
  installed=0
  while IFS= read -r serial; do
    [ -n "$serial" ] || continue
    if matches_filter "$serial"; then
      echo "==> [Android] Installing release APK on $serial"
      adb -s "$serial" install -r "$apk"
      adb -s "$serial" shell am start -n io.jarida.gooseonthego/.MainActivity
      installed=$((installed + 1))
    fi
  done < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')

  if [ "$installed" -eq 0 ]; then
    echo "==> [Android] No matching connected ADB devices found; APK built at $apk"
  fi
fi

if $want_ios; then
  echo "==> [iOS] Building embedded network (Pondnet.xcframework)"
  bash scripts/build-embedded-network.sh ios

  echo "==> [iOS] Prebuilding native project"
  npx expo prebuild --platform ios --clean

  ios_list="$(python3 - <<'PY'
import json, subprocess, tempfile, os
with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
    path = f.name
try:
    subprocess.run(["xcrun", "devicectl", "list", "devices", "--json-output", path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    data = json.load(open(path))
    for d in data.get("result", {}).get("devices", []):
        hw = d.get("hardwareProperties", {})
        if hw.get("reality") != "physical":
            continue
        conn = d.get("connectionProperties", {})
        tunnel = conn.get("tunnelState", "")
        if tunnel not in ("connected", "available"):
            continue
        udid = hw.get("udid") or d.get("identifier") or ""
        name = d.get("deviceProperties", {}).get("name") or udid
        if udid:
            print(f"{udid}\t{name}")
finally:
    if os.path.exists(path):
        os.unlink(path)
PY
)"

  deployed=0
  while IFS=$'\t' read -r udid name; do
    [ -n "${udid:-}" ] || continue
    if matches_filter "$udid" "$name"; then
      echo "==> [iOS] Building and installing Release on $name ($udid)"
      npx expo run:ios --configuration Release --device "$udid"
      deployed=$((deployed + 1))
    fi
  done <<< "$ios_list"

  if [ "$deployed" -eq 0 ]; then
    if [ ${#devices[@]} -gt 0 ]; then
      for target in "${devices[@]}"; do
        echo "==> [iOS] Trying explicit target $target"
        npx expo run:ios --configuration Release --device "$target"
      done
    else
      echo "==> [iOS] No connected physical iOS devices found; prebuilt iOS workspace ready in ios/"
    fi
  fi
fi
