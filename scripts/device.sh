#!/usr/bin/env bash
# iOS simulator driver for the autonomous test loop (Maestro + Metro).
# Usage: scripts/device.sh boot|build|install <A|B>
#        scripts/device.sh metro|down
#        scripts/device.sh test <A|B> <flow-or-dir> [extra maestro args]
#        scripts/device.sh shot <A|B> <path-without-ext>
# Never writes .env; overrides go through the environment of the processes it starts.
# Only the Metro process group recorded in .dev-stack/ is ever stopped; simulators stay booted.
set -euo pipefail

# Pinned devices (D31, iOS 26.5).
A=C29B497C-4443-4138-9DBA-DCFA5836C71E # iPhone 17 Pro — CLIENT
B=ADFA408E-172E-426D-B2B0-A3D22DFFC188 # iPhone 17e    — PROXY

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATE=".dev-stack"
METRO_PORT=8081
API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3333}"
APP_DIR="ios/build/Build/Products/Debug-iphonesimulator"

MAESTRO="${MAESTRO:-$(command -v maestro || echo "$HOME/.maestro/bin/maestro")}"
# Maestro's first run blocks on an interactive analytics prompt; keep it non-interactive.
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

# macOS ships a /usr/bin/java stub that fails without a runtime, so probe it instead of `command -v`.
ensure_java() {
  java -version >/dev/null 2>&1 && return 0
  export JAVA_HOME="$(brew --prefix openjdk@25)/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
}

udid_of() {
  case "${1:-}" in
    A) echo "$A" ;;
    B) echo "$B" ;;
    *)
      echo "unknown device '${1:-}' (expected A or B)" >&2
      exit 1
      ;;
  esac
}

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ' || true; }

comm_of() { ps -o comm= -p "$1" 2>/dev/null || true; }

lstart_of() { ps -o lstart= -p "$1" 2>/dev/null || true; }

group_alive() { [ -n "${1:-}" ] && kill -0 -- "-$1" 2>/dev/null; }

metro_pid() { cat "$STATE/metro.pid" 2>/dev/null || true; }

# True when live <pid> has BOTH the recorded command name and start time. comm alone is not
# enough: Metro (npx) and any other node process all report `node`.
metro_same() {
  local comm lstart
  comm="$(cat "$STATE/metro.comm" 2>/dev/null || true)"
  lstart="$(cat "$STATE/metro.lstart" 2>/dev/null || true)"
  [ -n "$comm" ] && [ -n "$lstart" ] &&
    [ "$(comm_of "$1")" = "$comm" ] && [ "$(lstart_of "$1")" = "$lstart" ]
}

# True when the recorded leader is alive AND still the process we started (guards against pid reuse).
metro_ours() {
  local pid
  pid="$(metro_pid)"
  alive "$pid" && metro_same "$pid"
}

listeners() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }

metro_ready() { [ "$(curl -s "localhost:$METRO_PORT/status" 2>/dev/null || true)" = "packager-status:running" ]; }

cmd_boot() {
  local udid out
  udid="$(udid_of "${1:-}")"
  if ! out="$(xcrun simctl boot "$udid" 2>&1)"; then
    case "$out" in
      *"current state: Booted"*) ;;
      *)
        echo "$out" >&2
        exit 1
        ;;
    esac
  fi
  # Viewer only (headless works for simctl/Maestro). Xcode 27 replaced Simulator.app with DeviceHub.app.
  open -a Simulator 2>/dev/null || open -a DeviceHub 2>/dev/null || true
  xcrun simctl bootstatus "$udid" >/dev/null
  echo "booted $1 ($udid)"
}

cmd_metro() {
  local pid pgid
  pgid="$(cat "$STATE/metro.pgid" 2>/dev/null || true)"
  if alive "$(metro_pid)" && ! metro_same "$(metro_pid)"; then
    echo "warning: pid $(metro_pid) is now '$(comm_of "$(metro_pid)")' started $(lstart_of "$(metro_pid)"), not our metro; skipping" >&2
  fi
  for pid in $(listeners "$METRO_PORT"); do
    if metro_ours && [ -n "$pgid" ] && [ "$(pgid_of "$pid")" = "$pgid" ]; then
      continue
    fi
    echo "port $METRO_PORT is held by pid $pid ($(comm_of "$pid")), not started by this script; not starting"
    exit 1
  done
  if metro_ours && metro_ready; then
    echo "metro already running (pid $(metro_pid))"
    return 0
  fi
  if metro_ours; then
    echo "metro (pid $(metro_pid)) is alive but not answering; run 'down' first"
    exit 1
  fi

  # Only our own files: shots/ and maestro/ survive a Metro restart (only `down` removes .dev-stack/).
  rm -f "$STATE/metro.pid" "$STATE/metro.pgid" "$STATE/metro.comm" "$STATE/metro.lstart" "$STATE/metro.log"
  mkdir -p "$STATE"
  # Job control on: the background job becomes its own process group leader (pid == pgid),
  # so `down` can kill the whole npx -> expo -> node tree.
  set -m
  EXPO_PUBLIC_API_URL="$API_URL" nohup npx expo start --port "$METRO_PORT" \
    >"$STATE/metro.log" 2>&1 </dev/null &
  pid=$!
  set +m
  echo "$pid" >"$STATE/metro.pid"
  echo "$pid" >"$STATE/metro.pgid"
  sleep 1 # let nohup exec into the real command before recording its name
  comm_of "$pid" >"$STATE/metro.comm"
  lstart_of "$pid" >"$STATE/metro.lstart"

  local waited=0
  until metro_ready; do
    if ! alive "$pid"; then
      echo "metro exited before answering"
      tail -n 40 "$STATE/metro.log" || true
      cmd_down
      exit 2
    fi
    if [ "$waited" -ge 60 ]; then
      echo "metro did not answer within 60s; stopping it"
      tail -n 40 "$STATE/metro.log" || true
      cmd_down
      exit 2
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "metro $METRO_PORT pid $pid (EXPO_PUBLIC_API_URL=$API_URL)"
}

cmd_build() {
  local udid
  udid="$(udid_of "${1:-}")"
  cmd_boot "$1"
  EXPO_PUBLIC_API_URL="$API_URL" npx expo run:ios --device "$udid" --no-bundler
}

# The .app from `build`: ios/build/... when Xcode builds in-tree, otherwise the newest
# DerivedData/proxyapp-* product (expo run:ios on Xcode 27 builds into DerivedData).
app_path() {
  local app
  app="$(ls -td "$APP_DIR"/*.app \
    "$HOME"/Library/Developer/Xcode/DerivedData/proxyapp-*/Build/Products/Debug-iphonesimulator/*.app \
    2>/dev/null | head -n 1 || true)"
  if [ -z "$app" ] || [ ! -d "$app" ]; then
    echo "no .app found under $APP_DIR or DerivedData/proxyapp-*; run 'build A' first" >&2
    exit 1
  fi
  echo "$app"
}

cmd_install() {
  local udid app
  udid="$(udid_of "${1:-}")"
  app="$(app_path)"
  xcrun simctl install "$udid" "$app"
  echo "installed $app on $1 ($udid)"
}

cmd_test() {
  local udid letter="${1:-}"
  udid="$(udid_of "$letter")"
  shift
  if [ -z "${1:-}" ]; then
    echo "usage: $0 test <A|B> <flow-or-dir> [extra maestro args]" >&2
    exit 1
  fi
  local path="$1"
  shift
  ensure_java
  # Maestro 2.x writes takeScreenshot files under its per-run output dir, not the cwd. Keep that dir
  # in .dev-stack/maestro/ and copy every PNG under a takeScreenshot/ dir into .dev-stack/shots/,
  # keeping its relative path, so `takeScreenshot: auth--sign-in` lands at
  # .dev-stack/shots/auth--sign-in.png (also when the flow fails). A legacy `.dev-stack/shots/`
  # prefix in the flow is stripped so it does not nest.
  local out rc=0 dir f rel shots="$ROOT/$STATE/shots"
  out="$STATE/maestro/$(date +%Y%m%d-%H%M%S)-$letter-$$"
  mkdir -p "$out" "$shots"
  "$MAESTRO" --device "$udid" test --test-output-dir "$out" "$path" "$@" || rc=$?
  while IFS= read -r dir; do
    while IFS= read -r f; do
      rel="${f#"$dir"/}"
      rel="${rel#.dev-stack/shots/}"
      mkdir -p "$shots/$(dirname "$rel")"
      cp "$f" "$shots/$rel"
      echo "screenshot: $STATE/shots/$rel"
    done < <(find "$dir" -type f -name '*.png' 2>/dev/null)
  done < <(find "$out" -type d -name takeScreenshot 2>/dev/null)
  echo "maestro output: $out"
  return "$rc"
}

cmd_shot() {
  local udid
  udid="$(udid_of "${1:-}")"
  if [ -z "${2:-}" ]; then
    echo "usage: $0 shot <A|B> <path-without-ext>" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$2")"
  xcrun simctl io "$udid" screenshot "$2.png"
}

cmd_down() {
  local pid pgid own i
  own="$(pgid_of $$)"
  pid="$(metro_pid)"
  pgid="$(cat "$STATE/metro.pgid" 2>/dev/null || true)"
  if [ -n "$pgid" ] && [ "$pgid" != "$own" ]; then
    # Pid-reuse guard: a live leader whose command name or start time differs is not ours.
    if alive "$pid" && ! metro_same "$pid"; then
      echo "warning: pid $pid is now '$(comm_of "$pid")' started $(lstart_of "$pid"), not our metro; skipping"
    elif group_alive "$pgid"; then
      kill -- "-$pgid" 2>/dev/null || true
      for i in 1 2 3 4 5; do
        group_alive "$pgid" || break
        sleep 1
      done
      if group_alive "$pgid"; then
        kill -9 -- "-$pgid" 2>/dev/null || true
      fi
    fi
  fi
  rm -rf "$STATE"
  echo "metro stopped (simulators left booted)"
}

case "${1:-}" in
  boot) cmd_boot "${2:-}" ;;
  metro) cmd_metro ;;
  build) cmd_build "${2:-}" ;;
  install) cmd_install "${2:-}" ;;
  test)
    shift
    cmd_test "$@"
    ;;
  shot) cmd_shot "${2:-}" "${3:-}" ;;
  down) cmd_down ;;
  *)
    echo "usage: $0 boot|build|install <A|B> | metro | down | test <A|B> <flow-or-dir> [args] | shot <A|B> <path>"
    exit 1
    ;;
esac
