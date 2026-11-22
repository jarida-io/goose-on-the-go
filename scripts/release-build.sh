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
    if [ "$d" = "$id" ] || { [ -n "$label" ] && [ "$d" = "$label" ]; }; then
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

  # Prefer the `properties` dictionary; Xcode 26 deprecated the flat *Properties keys.
  ios_devices() {
    python3 - <<'PY'
import json, subprocess, tempfile, os

with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
    path = f.name
try:
    subprocess.run(
        ["xcrun", "devicectl", "list", "devices", "--json-output", path],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    with open(path) as fh:
        data = json.load(fh)
except (OSError, ValueError):
    data = {}
finally:
    if os.path.exists(path):
        os.unlink(path)

for d in data.get("result", {}).get("devices", []):
    props = d.get("properties", {})
    hw = props.get("hardware") or d.get("hardwareProperties", {})
    conn = props.get("connection") or d.get("connectionProperties", {})
    state = props.get("state") or d.get("deviceProperties", {})
    if hw.get("reality") != "physical":
        continue
    udid = hw.get("udid") or d.get("identifier") or ""
    if not udid:
        continue
    name = state.get("name") or udid
    link = conn.get("state") or conn.get("tunnelState") or "unavailable"
    print(f"{udid}\t{name}\t{link}")
PY
  }

  matching_ios() {
    local udid name link
    while IFS=$'\t' read -r udid name link; do
      [ -n "${udid:-}" ] || continue
      matches_filter "$udid" "$name" || continue
      printf '%s\t%s\t%s\n' "$udid" "$name" "$link"
    done
  }

  reachable_ios() {
    local udid name link
    while IFS=$'\t' read -r udid name link; do
      case "$link" in connected|available) printf '%s\t%s\n' "$udid" "$name" ;; esac
    done
  }

  # CoreDevice opens a device's tunnel lazily, so the listing right after a prebuild
  # reports a present phone as unavailable; poke each paired device and keep looking.
  ios_all="$(ios_devices)"
  ios_wanted="$(printf '%s\n' "$ios_all" | matching_ios)"
  ios_list="$(printf '%s\n' "$ios_wanted" | reachable_ios)"
  waited=0
  while [ -z "$ios_list" ] && [ -n "${ios_wanted//[[:space:]]/}" ] && [ "$waited" -lt 40 ]; do
    if [ "$waited" -eq 0 ]; then
      echo "==> [iOS] No device online yet; waking paired devices"
      while IFS=$'\t' read -r udid name link; do
        xcrun devicectl device info details --device "$udid" --timeout 30 >/dev/null 2>&1 &
      done <<< "$ios_wanted"
    fi
    sleep 4
    waited=$((waited + 4))
    ios_all="$(ios_devices)"
    ios_wanted="$(printf '%s\n' "$ios_all" | matching_ios)"
    ios_list="$(printf '%s\n' "$ios_wanted" | reachable_ios)"
  done

  deployed=0
  while IFS=$'\t' read -r udid name; do
    [ -n "${udid:-}" ] || continue
    echo "==> [iOS] Building and installing Release on $name ($udid)"
    npx expo run:ios --configuration Release --no-bundler --device "$udid"
    deployed=$((deployed + 1))
  done <<< "$ios_list"

  if [ "$deployed" -eq 0 ]; then
    if [ ${#devices[@]} -gt 0 ]; then
      for target in "${devices[@]}"; do
        echo "==> [iOS] Trying explicit target $target"
        npx expo run:ios --configuration Release --no-bundler --device "$target"
      done
    elif [ -n "${ios_wanted//[[:space:]]/}" ]; then
      echo "==> [iOS] No paired device came online in ${waited}s; prebuilt iOS workspace ready in ios/"
      while IFS=$'\t' read -r udid name link; do
        [ -n "${udid:-}" ] || continue
        echo "      $name ($udid): $link"
      done <<< "$ios_wanted"
      echo "    Unlock the phone and keep it on this network or plugged in, then re-run,"
      echo "    or target it directly: npm run build -- --ios --device <udid>"
    else
      echo "==> [iOS] No paired iPhone known to Xcode; prebuilt iOS workspace ready in ios/"
      echo "    Pair one under Xcode > Window > Devices and Simulators, then re-run."
    fi
  fi
fi
