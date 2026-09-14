#!/usr/bin/env bash
#
# Runs exactly what .github/workflows/ci.yml runs, so a green run here means a
# green check there.
#
# It exists because a pull request was reported locally verified and failed CI
# on `prettier --check`. The local run had been `pnpm typecheck` and `pnpm test`;
# CI's build job runs more gates than that. Nothing was wrong with either command,
# and nothing said the others existed — they are written down only in the
# workflow file, so anybody checking locally is guessing which ones matter. A
# note reminding people to run all of them is not a fix. This is.
#
# The order below is CI's order, deliberately. Typecheck before lint before
# format means the failure you see first is the one furthest from cosmetic.
#
# Usage:
#   ./verify.sh                 the gates CI's build job runs
#   ./verify.sh --no-test       everything except the test suite (the fast half)
#   ./verify.sh --no-install    skip the lockfile check, for a tight edit loop
#   ./verify.sh --live          the gates, then what CI's live jobs run:
#                               scripts/e2e-local.sh starts a throwaway backend
#                               and runs the OpenAPI drift gate, the contract
#                               suite and the Playwright specs against it
#
# On Windows, run it from Git Bash.
#
# What it does NOT prove without --live: that the gateway the apps use agrees
# with the backend. CI's contract job does; see "The contract suite" at the end.
set -euo pipefail

cd "$(dirname "$0")"

RUN_TESTS=1
RUN_INSTALL=1
RUN_LIVE=0

for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TESTS=0 ;;
    --no-install) RUN_INSTALL=0 ;;
    --live) RUN_LIVE=1 ;;
    -h|--help) sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify.sh: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# The workflow takes the Node version from .nvmrc so that "a developer's shell
# and CI cannot drift". This is the half of that sentence the workflow cannot
# enforce. A warning rather than a failure: a mismatched minor is usually fine,
# and being unable to run the checks at all is worse than running them on 24.1
# when CI is on 24.9.
if [ -f .nvmrc ]; then
  want="$(tr -dc '0-9' < .nvmrc | head -c 2)"
  have="$(node -v | tr -dc '0-9.' | cut -d. -f1)"

  if [ -n "$want" ] && [ "$want" != "$have" ]; then
    printf '\033[33mNode %s is pinned in .nvmrc; this shell is on %s. CI uses the pin.\033[0m\n' \
      "$want" "$have" >&2
  fi
fi

# --frozen-lockfile is the point of running this at all rather than a bare
# install: it fails when the lockfile does not match package.json, which is how
# a dependency added locally and never committed is caught here instead of by
# the next person's clone.
if [ "$RUN_INSTALL" -eq 1 ]; then
  step "Install (--frozen-lockfile)"
  pnpm install --frozen-lockfile
fi

# --live starts a backend at the very end, after minutes of gates. Its
# pre-flight — the backend checkout, SQL Server, sqlcmd, free ports, Chromium —
# runs before the gates, so a missing prerequisite fails now rather than after
# the build. After the install, though: it needs node_modules (and the
# Playwright it finds Chromium with), which a fresh clone has only from here.
if [ "$RUN_LIVE" -eq 1 ]; then
  step "Pre-flight for --live"
  bash scripts/e2e-local.sh --preflight
fi

step "Typecheck"
pnpm typecheck

step "Lint"
pnpm lint

step "Formatting"
pnpm format:check

# Deliberately a failure, not a warning, and the workflow says why: a key added
# in English and missing in Armenian ships an English string to a waiter who
# does not read it, and nobody notices until a shift.
step "Translation parity"
pnpm i18n:check

step "Build the web console"
pnpm build:web

# Metro, not Vite. Nothing else here runs the bundler the phone app ships with:
# typecheck does not resolve assets and the diner's tests run under Vitest, so an
# import or a `require` of an image that only Metro fails to resolve would
# otherwise first fail on a phone. The web export is the one every machine can
# produce. Pinned to real data so it is the bundle that talks to a backend; the
# output (apps/diner/dist-web) is gitignored.
step "Bundle the diner app"
EXPO_PUBLIC_DATA_SOURCE=real EXPO_PUBLIC_API_URL=http://localhost:5086 EXPO_NO_TELEMETRY=1 \
  pnpm --filter @yalla/diner exec expo export --platform web --output-dir dist-web

if [ "$RUN_TESTS" -eq 0 ] && [ "$RUN_LIVE" -eq 0 ]; then
  printf '\n\033[1mBuild, bundle, lint, formatting and parity verified. Tests skipped (--no-test).\033[0m\n'
  exit 0
fi

if [ "$RUN_TESTS" -eq 1 ]; then
  step "Test"
  pnpm test
fi

# CI's `contract` and `diner-web-e2e` jobs, on this machine: a backend built from
# the checkout beside this one, on a database and photo folder that exist for the
# run and are removed at the end. Non-zero if the backend cannot start, or if any
# of the drift gate, the contract suite or the specs fails.
if [ "$RUN_LIVE" -eq 1 ]; then
  step "Live: drift gate, contract suite and end-to-end against a throwaway backend"
  bash scripts/e2e-local.sh
fi

# ---------------------------------------------------------------------------
# The contract suite, and what this run did not prove.
#
# packages/api/src/contract is one set of assertions run against both
# implementations of the gateway interfaces. `pnpm test` runs it against the
# mock, offline. The live half needs a backend on a URL, and is off unless
# YALLA_CONTRACT_BASE_URL is set or --live starts one — in CI it is its own job,
# against the backend built from source with a SQL Server container, and needs
# no secrets.
#
# The backend's verify.sh FAILS when its integration tests skip, because a run
# with no SQL Server proves nothing about the concurrency it claims to test.
# That rule is not copied here, and the difference is worth stating: the suite
# above genuinely proves what it claims about the mock, and the live half
# announces its own absence in the test name rather than passing silently. So
# this reports rather than refuses. What it must not do is let the green above
# read as more than it is: three defects have survived in this repo because the
# double reproduced them.
# ---------------------------------------------------------------------------
step "The contract suite"

if [ "$RUN_LIVE" -eq 1 ]; then
  printf 'Ran against a throwaway live backend (scripts/e2e-local.sh) as well as the mock,\n'
  printf 'with the OpenAPI drift gate and the Playwright specs.\n'
elif [ -n "${YALLA_CONTRACT_BASE_URL:-}" ]; then
  printf 'Ran against a live backend at %s as well as the mock.\n' "$YALLA_CONTRACT_BASE_URL"
else
  cat <<'MESSAGE'
Ran against the MOCK ONLY. The live half did not run, so nothing above says the
gateway and the backend agree — only that the mock agrees with itself, which is
the failure the contract suite was written for.

To run it, and the end-to-end specs, against a backend started for the purpose:

  ./verify.sh --live

Or against a backend already up on 5086:

  YALLA_CONTRACT_BASE_URL=http://localhost:5086 ./verify.sh
MESSAGE
fi

if [ "$RUN_TESTS" -eq 0 ]; then
  printf '\n\033[1;32mVerified, live half included. Unit tests skipped (--no-test).\033[0m\n'
elif [ "$RUN_LIVE" -eq 1 ]; then
  printf '\n\033[1;32mVerified, live half included. This is what CI runs.\033[0m\n'
else
  printf '\n\033[1;32mVerified. This is what CI runs.\033[0m\n'
fi
