#!/usr/bin/env bash
#
# The whole product on real data: the backend, the console and the diner app's
# web build, all talking to the one backend.
#
#   pnpm dev:real                   all three
#   pnpm dev:real --only api        just one: api, console or diner (repeatable)
#   pnpm dev:real --no-api          the two apps, against a backend you started
#
#   process  URL                      data
#   api      http://localhost:5086    $YALLA_BACKEND_DIR, Development, plain http
#   console  http://localhost:5173    VITE_DATA_SOURCE=real, VITE_API_URL
#   diner    http://localhost:8095    EXPO_PUBLIC_DATA_SOURCE=real, EXPO_PUBLIC_API_URL
#
# Environment:
#   YALLA_BACKEND_DIR    the backend checkout. Default: ../Yalla-browse beside this
#                        repo, then ../Yalla. When set, it is used as given or not at all.
#   YALLA_API_PORT       default 5086
#   YALLA_CONSOLE_PORT   default 5173
#   YALLA_DINER_PORT     default 8095
#   VITE_API_URL, EXPO_PUBLIC_API_URL
#                        the backend origin each app calls. Default http://localhost:$YALLA_API_PORT.
#
# The backend needs its user secrets and a SQL Server first — see "Run everything
# on real data" in README.md. If a backend already answers on the API port it is
# used rather than a second one started.
#
# The diner process is the web target, for QA on this machine. A phone needs the
# laptop's LAN address, not localhost: use `pnpm dev:diner` for that.
#
# Ctrl+C stops all three. If one of them exits, the others are stopped and its
# exit code is this script's.
#
# On Windows, `pnpm dev:real` runs this through scripts/bash.mjs, which finds Git
# Bash rather than WSL's bash.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

usage() { sed -n '3,33p' "$0" | sed 's/^# \{0,1\}//'; }

want_api=0 want_console=0 want_diner=0 only=0 no_api=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      [ $# -ge 2 ] || { echo "dev-real: --only needs api, console or diner" >&2; exit 2; }
      only=1
      case "$2" in
        api) want_api=1 ;;
        console) want_console=1 ;;
        diner) want_diner=1 ;;
        *) echo "dev-real: unknown process '$2' (api, console or diner)" >&2; exit 2 ;;
      esac
      shift 2
      ;;
    --no-api) no_api=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "dev-real: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [ "$only" -eq 0 ]; then
  want_api=1 want_console=1 want_diner=1
fi
if [ "$no_api" -eq 1 ]; then
  want_api=0
fi

api_port="${YALLA_API_PORT:-5086}"
console_port="${YALLA_CONSOLE_PORT:-5173}"
diner_port="${YALLA_DINER_PORT:-8095}"
default_api_url="http://localhost:${api_port}"

fail() { printf '\033[31mdev-real: %s\033[0m\n' "$1" >&2; exit 1; }
note() { printf '\033[1mdev-real:\033[0m %s\n' "$1"; }

# Each line of a process's output, tagged with its name. awk rather than
# `sed -u`, which macOS's sed does not have.
prefix() { awk -v tag="[$1] " '{ print tag $0; fflush() }'; }

api_answers() { curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${api_port}/api/public/venues" 2>/dev/null; }

# ---------------------------------------------------------------------------
# Pre-flight. Every check here is one that otherwise surfaces as a wall of
# interleaved log output from three processes.
# ---------------------------------------------------------------------------
if [ "$want_console" -eq 1 ] || [ "$want_diner" -eq 1 ]; then
  command -v pnpm >/dev/null 2>&1 || fail "pnpm is not on PATH (corepack enable)."
  [ -d node_modules ] || fail "no node_modules here. Run pnpm install first."
fi

backend_dir=""
if [ "$want_api" -eq 1 ] && api_answers; then
  note "a backend already answers on :${api_port}; using it rather than starting a second one."
  want_api=0
fi

if [ "$want_api" -eq 1 ]; then
  command -v dotnet >/dev/null 2>&1 || fail "dotnet is not on PATH. The backend needs the .NET SDK in its global.json."

  if [ -n "${YALLA_BACKEND_DIR:-}" ]; then
    backend_dir="$YALLA_BACKEND_DIR"
    [ -f "$backend_dir/src/Yalla.Api/Yalla.Api.csproj" ] \
      || fail "YALLA_BACKEND_DIR=$backend_dir has no src/Yalla.Api/Yalla.Api.csproj."
  else
    for candidate in ../Yalla-browse ../Yalla; do
      if [ -f "$candidate/src/Yalla.Api/Yalla.Api.csproj" ]; then
        backend_dir="$candidate"
        break
      fi
    done
    [ -n "$backend_dir" ] \
      || fail "no backend checkout at ../Yalla-browse or ../Yalla. Clone grigoravagyann/Yalla beside this repo, or set YALLA_BACKEND_DIR."
  fi
  backend_dir="$(cd "$backend_dir" && pwd)"

  # The API refuses to start without these, but only after a build, a restore and
  # a screenful of log. Environment variables count as well as user secrets.
  missing=()
  secrets="$(dotnet user-secrets list --project "$backend_dir/src/Yalla.Api/Yalla.Api.csproj" 2>/dev/null || true)"
  for key in Jwt:SigningKey PlatformAdmin:Email PlatformAdmin:Password; do
    env_name="${key//:/__}"
    if [ -z "${!env_name:-}" ] && ! printf '%s\n' "$secrets" | grep -q "^${key} = "; then
      missing+=("$key")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    {
      echo "dev-real: the backend is missing ${missing[*]}. Set them once, from $backend_dir:"
      echo
      echo '  dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48)" --project src/Yalla.Api'
      echo '  dotnet user-secrets set "PlatformAdmin:Email" "<your email>" --project src/Yalla.Api'
      echo '  dotnet user-secrets set "PlatformAdmin:Password" "<12+ characters>" --project src/Yalla.Api'
    } >&2
    exit 1
  fi
fi

if [ "$want_api" -eq 0 ] && [ "$want_console" -eq 0 ] && [ "$want_diner" -eq 0 ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Start, and stop everything together.
# ---------------------------------------------------------------------------
pids=()
names=()

# Kills a process and everything it started. `dotnet run` starts Yalla.Api, and
# pnpm starts node which starts vite or Metro; killing only the direct child
# leaves the port held. On Git Bash the Windows process tree is the reliable one.
stop_tree() {
  local pid="$1" child
  kill -0 "$pid" 2>/dev/null || return 0
  if [ -r "/proc/$pid/winpid" ] && command -v taskkill >/dev/null 2>&1; then
    taskkill //F //T //PID "$(cat "/proc/$pid/winpid")" >/dev/null 2>&1 || true
  else
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
      stop_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  trap - EXIT INT TERM
  local pid
  for pid in "${pids[@]}"; do
    stop_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

started_at=$(date +%s)

if [ "$want_api" -eq 1 ]; then
  note "api: $backend_dir on http://0.0.0.0:${api_port} (Development)"
  # --no-launch-profile: the launch profile would also bind https 7289, which
  # needs a trusted dev certificate. Without a profile nothing sets the
  # environment, so Development is stated here; it is what turns on the seed,
  # the dev verification code and the LAN CORS rule.
  (
    cd "$backend_dir"
    exec env ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS="http://0.0.0.0:${api_port}" \
      dotnet run --project src/Yalla.Api/Yalla.Api.csproj --no-launch-profile
  ) > >(prefix api) 2>&1 &
  pids+=("$!")
  names+=(api)
fi

if [ "$want_console" -eq 1 ]; then
  note "console: http://localhost:${console_port} -> ${VITE_API_URL:-$default_api_url}"
  env VITE_DATA_SOURCE=real VITE_API_URL="${VITE_API_URL:-$default_api_url}" \
    pnpm --filter @yalla/web dev --port "$console_port" --strictPort > >(prefix console) 2>&1 &
  pids+=("$!")
  names+=(console)
fi

if [ "$want_diner" -eq 1 ]; then
  note "diner (web): http://localhost:${diner_port} -> ${EXPO_PUBLIC_API_URL:-$default_api_url}"
  env EXPO_PUBLIC_DATA_SOURCE=real EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-$default_api_url}" \
    pnpm --filter @yalla/diner exec expo start --web --port "$diner_port" > >(prefix diner) 2>&1 &
  pids+=("$!")
  names+=(diner)
fi

api_announced=0
while :; do
  for i in "${!pids[@]}"; do
    if ! kill -0 "${pids[$i]}" 2>/dev/null; then
      set +e
      wait "${pids[$i]}"
      code=$?
      set -e
      if [ "${#pids[@]}" -gt 1 ]; then
        printf '\033[31mdev-real: %s exited with code %s; stopping the others.\033[0m\n' "${names[$i]}" "$code" >&2
      fi
      exit "$code"
    fi
  done

  if [ "$want_api" -eq 1 ] && [ "$api_announced" -eq 0 ] && api_answers; then
    api_announced=1
    note "API up after $(( $(date +%s) - started_at ))s: http://localhost:${api_port}/swagger"
  fi

  sleep 1
done
