#!/usr/bin/env bash
#
# The live half of the checks, on this machine, against a backend that exists for
# one run: the OpenAPI drift gate, the contract suite against the HTTP client, and
# the Playwright specs on the diner web build and the console.
#
#   ./scripts/e2e-local.sh                all of it
#   ./scripts/e2e-local.sh --no-contract  no drift gate and no contract suite (CI's
#                                         e2e job; the contract job runs both)
#   ./scripts/e2e-local.sh --no-e2e       the drift gate and contract suite only
#   ./scripts/e2e-local.sh --preflight    check tools, backend checkout, SQL Server
#                                         and ports; start nothing
#   ./scripts/e2e-local.sh --keep         leave the database and temp folder behind
#   pnpm e2e:local [flags]                the same, through Git Bash on Windows
#   ./verify.sh --live                    the CI gates, then this
#
# What one run makes, and removes again on the way out however it ends:
#   api       $YALLA_BACKEND_DIR, built into the run's temp folder (never the
#             checkout's bin/ or obj/), Development, dev seed on,
#             http://127.0.0.1:$E2E_API_PORT
#   database  YallaE2E_<8 hex> on $E2E_SQL_SERVER, made by the API's migrations,
#             dropped at exit
#   photos    a folder in the run's temp folder
#   diner     the web export (real data), served on 127.0.0.1:$E2E_DINER_PORT
#   console   the production build (real data), served on 127.0.0.1:$E2E_CONSOLE_PORT
#   admin     a platform admin and a JWT signing key made up for the run, handed
#             to the processes in their environment and never printed
#
# Environment:
#   YALLA_BACKEND_DIR   the backend checkout. Default ../Yalla-browse beside this
#                       repo, then ../Yalla. When set, used as given or not at all.
#   E2E_SQL_SERVER      default (localdb)\MSSQLLocalDB on Windows, localhost elsewhere
#   E2E_SQL_USER        SQL authentication (with E2E_SQL_PASSWORD), e.g. a
#                       container's sa. Unset: integrated security.
#   E2E_SQLCMD          the sqlcmd command; split on spaces unless it names a file.
#                       Default: sqlcmd on PATH.
#   E2E_API_PORT        default 5199
#   E2E_DINER_PORT      default 8199
#   E2E_CONSOLE_PORT    default 5198
#   E2E_API_TIMEOUT     seconds to wait for the API to answer, default 240
#   E2E_ARTIFACTS_DIR   if set, the API log, the contract results and the live
#                       OpenAPI document are copied here at exit
#
# Needs dotnet (the SDK in the backend's global.json), node, pnpm after
# `pnpm install`, curl, sqlcmd, and Chromium for Playwright
# (`pnpm --filter @yalla/e2e install:browsers`, once).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

usage() { sed -n '3,46p' "$0" | sed 's/^# \{0,1\}//'; }

run_contract=1 run_e2e=1 preflight_only=0 keep=0
for arg in "$@"; do
  case "$arg" in
    --no-contract) run_contract=0 ;;
    --no-e2e) run_e2e=0 ;;
    --preflight) preflight_only=1 ;;
    --keep) keep=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "e2e-local: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

if [ "$run_contract" -eq 0 ] && [ "$run_e2e" -eq 0 ]; then
  echo "e2e-local: --no-contract and --no-e2e together leave nothing to run." >&2
  exit 2
fi

step() { printf '\n\033[1m==> e2e-local: %s\033[0m\n' "$1"; }
note() { printf 'e2e-local: %s\n' "$1"; }
fail() { printf '\033[31me2e-local: %s\033[0m\n' "$1" >&2; exit 1; }

# Paths handed to native Windows programs (dotnet, node) must be Windows paths;
# Git Bash's /tmp means nothing to them. Mixed form (C:/...) suits both.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

random_text() {
  node -e 'process.stdout.write(require("node:crypto").randomBytes(Number(process.argv[1])).toString(process.argv[2]))' "$1" "$2"
}

# True when something accepts a TCP connection on 127.0.0.1:$1.
listening() {
  node -e '
    const socket = require("node:net").connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
    socket.setTimeout(1500);
    socket.on("connect", () => process.exit(0));
    socket.on("error", () => process.exit(1));
    socket.on("timeout", () => process.exit(1));
  ' "$1"
}

api_port="${E2E_API_PORT:-5199}"
diner_port="${E2E_DINER_PORT:-8199}"
console_port="${E2E_CONSOLE_PORT:-5198}"
api_url="http://127.0.0.1:${api_port}"
diner_url="http://127.0.0.1:${diner_port}"
console_url="http://127.0.0.1:${console_port}"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) default_sql_server='(localdb)\MSSQLLocalDB' ;;
  *) default_sql_server='localhost' ;;
esac
sql_server="${E2E_SQL_SERVER:-$default_sql_server}"

# ---------------------------------------------------------------------------
# Pre-flight. Everything here otherwise fails minutes in, after a build.
# ---------------------------------------------------------------------------
step "Pre-flight"

for tool in node pnpm dotnet curl; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is not on PATH."
done
[ -d node_modules ] || fail "no node_modules here. Run pnpm install first."

if [ -n "${YALLA_BACKEND_DIR:-}" ]; then
  backend_dir="$YALLA_BACKEND_DIR"
  [ -f "$backend_dir/src/Yalla.Api/Yalla.Api.csproj" ] \
    || fail "YALLA_BACKEND_DIR=$backend_dir has no src/Yalla.Api/Yalla.Api.csproj."
else
  backend_dir=""
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

sqlcmd_cmd=()
if [ -n "${E2E_SQLCMD:-}" ]; then
  if [ -f "$E2E_SQLCMD" ]; then
    sqlcmd_cmd=("$E2E_SQLCMD")
  else
    read -r -a sqlcmd_cmd <<< "$E2E_SQLCMD"
  fi
elif command -v sqlcmd >/dev/null 2>&1; then
  sqlcmd_cmd=(sqlcmd)
else
  fail "sqlcmd is not on PATH, and it is how this run's database is dropped. Install the SQL Server command-line tools, or set E2E_SQLCMD."
fi

# One query, quiet: no headers, no row counts, failing on any SQL error.
sql() {
  local auth=(-E)
  if [ -n "${E2E_SQL_USER:-}" ]; then
    auth=(-U "$E2E_SQL_USER")
  fi
  SQLCMDPASSWORD="${E2E_SQL_PASSWORD:-}" "${sqlcmd_cmd[@]}" \
    -S "$sql_server" "${auth[@]}" -C -b -l 30 -h -1 -W -Q "SET NOCOUNT ON; $1"
}

if ! sql_answer="$(sql 'SELECT 1' 2>&1)"; then
  fail "SQL Server at $sql_server did not answer: $(printf '%s' "$sql_answer" | tr -s '\r\n' ' ')"
fi

ports=("$api_port:api")
if [ "$run_e2e" -eq 1 ]; then
  ports+=("$diner_port:diner" "$console_port:console")
fi
for entry in "${ports[@]}"; do
  if listening "${entry%%:*}"; then
    fail "something already answers on 127.0.0.1:${entry%%:*}, which this run wants for the ${entry#*:}. Stop it, or move the run with E2E_API_PORT, E2E_DINER_PORT or E2E_CONSOLE_PORT."
  fi
done

if [ "$run_e2e" -eq 1 ]; then
  browser_dir="$(pnpm --filter @yalla/e2e exec playwright install --dry-run chromium 2>/dev/null \
    | tr -d '\r' | sed -nE 's/^[[:space:]]*Install location:[[:space:]]*(.*[^[:space:]])[[:space:]]*$/\1/p' | head -n 1 || true)"
  if [ -n "$browser_dir" ]; then
    if command -v cygpath >/dev/null 2>&1; then browser_dir="$(cygpath -u "$browser_dir")"; fi
    [ -d "$browser_dir" ] \
      || fail "Playwright's Chromium is not installed. Run: pnpm --filter @yalla/e2e install:browsers"
  fi
fi

note "backend $backend_dir; SQL Server $sql_server; ports api $api_port$([ "$run_e2e" -eq 1 ] && printf ', diner %s, console %s' "$diner_port" "$console_port")."

if [ "$preflight_only" -eq 1 ]; then
  note "pre-flight passed."
  exit 0
fi

# ---------------------------------------------------------------------------
# Teardown, registered before anything is started.
# ---------------------------------------------------------------------------
started_at=$(date +%s)
work="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/yalla-e2e-local.XXXXXX")"
api_log="$work/api.log"
contract_results="$work/contract-results.json"
live_swagger="$work/swagger.live.json"
database="YallaE2E_$(random_text 4 hex)"
database_owned=0
pids=()
names=()
failed=()
torn_down=0

# Kills a process and everything it started. On Git Bash the Windows process
# tree is the reliable one; elsewhere, children first.
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

# Returns non-zero when something it is responsible for was left behind.
teardown() {
  [ "$torn_down" -eq 0 ] || return 0
  torn_down=1
  local ok=0 i out waited

  for i in "${!pids[@]}"; do
    stop_tree "${pids[$i]}"
  done
  for i in "${!pids[@]}"; do
    wait "${pids[$i]}" 2>/dev/null || true
  done

  waited=0
  while listening "$api_port" && [ "$waited" -lt 15 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if listening "$api_port"; then
    printf '\033[31me2e-local: something still listens on 127.0.0.1:%s after stopping the API.\033[0m\n' "$api_port" >&2
    ok=1
  fi

  if [ "$database_owned" -eq 1 ]; then
    if [ "$keep" -eq 1 ]; then
      note "kept database $database on $sql_server (--keep)."
    elif out="$(sql "IF DB_ID(N'$database') IS NOT NULL BEGIN ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$database]; END" 2>&1)"; then
      note "dropped database $database."
    else
      printf '\033[31me2e-local: could not drop database %s on %s: %s\033[0m\n' \
        "$database" "$sql_server" "$(printf '%s' "$out" | tr -s '\r\n' ' ')" >&2
      ok=1
    fi
  fi

  if [ -n "${E2E_ARTIFACTS_DIR:-}" ]; then
    mkdir -p "$E2E_ARTIFACTS_DIR"
    for i in "$api_log" "$contract_results" "$live_swagger"; do
      if [ -f "$i" ]; then cp "$i" "$E2E_ARTIFACTS_DIR/"; fi
    done
  fi

  if [ "$keep" -eq 1 ]; then
    note "kept $work (--keep)."
  else
    rm -rf "$work" || ok=1
  fi

  return "$ok"
}

on_exit() {
  local code=$?
  trap - EXIT INT TERM
  set +e
  if [ "$code" -ne 0 ] && [ -s "$api_log" ]; then
    printf '\n--- the last 60 lines of the API log ---\n' >&2
    tail -n 60 "$api_log" >&2
    printf -- '--- end of the API log ---\n' >&2
  fi
  teardown || code=1
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

api_alive() {
  kill -0 "$api_pid" 2>/dev/null || fail "the API exited before it answered. The end of its log follows."
}

wait_for_url() {
  local url="$1" what="$2" limit="$3" waited=0
  while [ "$waited" -lt "$limit" ]; do
    if curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  fail "the $what did not answer $url within ${limit}s."
}

# ---------------------------------------------------------------------------
# The backend: built out of the checkout, started on a database of its own.
# ---------------------------------------------------------------------------
step "Build the API from $backend_dir"
api_build="$work/api-build"
if ! (cd "$backend_dir" && dotnet build src/Yalla.Api/Yalla.Api.csproj -c Release \
      --artifacts-path "$(native_path "$api_build")" -nologo -v:quiet -nodeReuse:false) \
      > "$work/api-build.log" 2>&1; then
  tail -n 40 "$work/api-build.log" >&2
  fail "the API did not build."
fi
api_out="$api_build/bin/Yalla.Api/release"
[ -f "$api_out/Yalla.Api.dll" ] || fail "the build succeeded but left no $api_out/Yalla.Api.dll."

exists="$(sql "SELECT CASE WHEN DB_ID(N'$database') IS NULL THEN 0 ELSE 1 END" | tr -dc '01')"
[ "$exists" = "0" ] || fail "database $database already exists on $sql_server; not touching it."
database_owned=1

if [ -n "${E2E_SQL_USER:-}" ]; then
  connection="Server=$sql_server;Database=$database;User Id=$E2E_SQL_USER;Password=${E2E_SQL_PASSWORD:-};TrustServerCertificate=True;MultipleActiveResultSets=True"
else
  connection="Server=$sql_server;Database=$database;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True"
fi

admin_email="e2e-admin-$(random_text 4 hex)@yalla.test"
admin_password="$(random_text 24 base64url)"
signing_key="$(random_text 48 base64)"
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::$admin_password"
  echo "::add-mask::$signing_key"
fi
mkdir -p "$work/photos"

step "Start the API on $api_url (database $database)"
# Development: it migrates on start, seeds the demo branch with photos, and
# returns the diner verification code in the response. Run from its build
# output, so the content root and the log folder are inside the temp folder.
(
  cd "$api_out"
  exec env \
    ASPNETCORE_ENVIRONMENT=Development \
    ASPNETCORE_URLS="$api_url" \
    "ConnectionStrings__Yalla=$connection" \
    "PlatformAdmin__Email=$admin_email" \
    "PlatformAdmin__Password=$admin_password" \
    "Jwt__SigningKey=$signing_key" \
    "PhotoStorage__RootPath=$(native_path "$work/photos")" \
    "Auth__PasswordResetUrlTemplate=$console_url/reset-password#token={token}" \
    "PublicWeb__ManageBookingUrlTemplate=$console_url/booking/{token}" \
    DevSeed__Enabled=true \
    DevActor__Enabled=false \
    'Serilog__MinimumLevel__Override__Microsoft.EntityFrameworkCore.Database.Command=Warning' \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    dotnet Yalla.Api.dll
) > "$api_log" 2>&1 &
api_pid=$!
api_started=$(date +%s)
pids+=("$api_pid")
names+=(api)

# ---------------------------------------------------------------------------
# The two apps, built while the API migrates and seeds. Each bakes the API URL in.
# ---------------------------------------------------------------------------
if [ "$run_e2e" -eq 1 ]; then
  diner_dist="$work/diner-web"
  console_dist="$work/console"

  # --clear: Metro's transform cache keeps the EXPO_PUBLIC_* values of the last
  # build that used it, so an export after a mock one can come out on mock data.
  step "Export the diner web app (real data, $api_url)"
  EXPO_PUBLIC_DATA_SOURCE=real EXPO_PUBLIC_API_URL="$api_url" EXPO_NO_TELEMETRY=1 CI=1 \
    pnpm --filter @yalla/diner exec expo export --platform web --clear \
    --output-dir "$(native_path "$diner_dist")"
  api_alive

  step "Build the console (real data, $api_url)"
  VITE_DATA_SOURCE=real VITE_API_URL="$api_url" \
    pnpm --filter @yalla/web exec vite build --outDir "$(native_path "$console_dist")" --emptyOutDir
  api_alive
fi

step "Wait for the API"
api_limit="${E2E_API_TIMEOUT:-240}"
while :; do
  if curl -fsS -o /dev/null --max-time 5 "$api_url/api/public/venues" 2>/dev/null; then
    note "API up after $(( $(date +%s) - api_started ))s"
    break
  fi
  api_alive
  if [ $(( $(date +%s) - api_started )) -ge "$api_limit" ]; then
    fail "the API did not answer $api_url/api/public/venues within ${api_limit}s. The end of its log follows."
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# The checks. A failure is recorded and the next check still runs, so one run
# says everything that is wrong; the exit code is non-zero if anything failed.
# ---------------------------------------------------------------------------
if [ "$run_contract" -eq 1 ]; then
  step "OpenAPI drift gate"
  node scripts/check-swagger-drift.mjs --url "$api_url/swagger/v1/swagger.json" \
    --save "$(native_path "$live_swagger")" \
    || failed+=("OpenAPI drift gate")

  step "Contract suite against the API"
  if YALLA_CONTRACT_BASE_URL="$api_url" \
     YALLA_CONTRACT_ADMIN_EMAIL="$admin_email" YALLA_CONTRACT_ADMIN_PASSWORD="$admin_password" \
     pnpm --filter @yalla/api exec vitest run src/contract/ \
       --reporter=default --reporter=json --outputFile.json="$(native_path "$contract_results")"; then
    # A green run in which nothing against the HTTP client passed proved nothing.
    node -e '
      const results = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
      const live = results.testResults
        .flatMap((file) => file.assertionResults)
        .filter((test) => test.fullName.includes("HTTP client"));
      const passed = live.filter((test) => test.status === "passed").length;
      console.log(`e2e-local: HTTP client: ${passed} passed of ${live.length}.`);
      process.exit(passed === 0 ? 1 : 0);
    ' "$(native_path "$contract_results")" \
      || failed+=("contract suite (no test against the HTTP client passed)")
  else
    failed+=("contract suite")
  fi
fi

if [ "$run_e2e" -eq 1 ]; then
  step "Serve the builds"
  node apps/e2e/scripts/serve-static.mjs --mode expo --port "$diner_port" \
    --root "$(native_path "$diner_dist")" > "$work/diner-serve.log" 2>&1 &
  pids+=("$!")
  names+=(diner)
  node apps/e2e/scripts/serve-static.mjs --mode spa --port "$console_port" \
    --root "$(native_path "$console_dist")" > "$work/console-serve.log" 2>&1 &
  pids+=("$!")
  names+=(console)
  wait_for_url "$diner_url" "diner web build" 30
  wait_for_url "$console_url" "console build" 30
  note "diner $diner_url, console $console_url"

  step "Playwright"
  if E2E_STACK=0 E2E_REQUIRED=1 \
     E2E_API_URL="$api_url" E2E_DINER_URL="$diner_url" E2E_CONSOLE_URL="$console_url" \
     E2E_ADMIN_EMAIL="$admin_email" E2E_ADMIN_PASSWORD="$admin_password" \
     pnpm --filter @yalla/e2e test; then
    :
  else
    failed+=("end-to-end specs (report: apps/e2e/playwright-report)")
  fi
fi

# ---------------------------------------------------------------------------
# Done: tear down first, so the last line says how it went.
# ---------------------------------------------------------------------------
if [ "${#failed[@]}" -gt 0 ]; then
  printf '\n\033[31me2e-local: failed:\033[0m\n' >&2
  printf '  - %s\n' "${failed[@]}" >&2
  exit 1
fi

step "Tear down"
trap - EXIT INT TERM
teardown || fail "the checks passed, but the run did not clean up after itself (see above)."

if [ "$run_contract" -eq 1 ] && [ "$run_e2e" -eq 1 ]; then
  outcome="live contract + e2e passed"
elif [ "$run_contract" -eq 1 ]; then
  outcome="live contract passed"
else
  outcome="e2e passed"
fi
printf '\n\033[1;32me2e-local: %s in %ss.\033[0m\n' "$outcome" "$(( $(date +%s) - started_at ))"
