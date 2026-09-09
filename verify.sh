#!/usr/bin/env bash
#
# Runs exactly what .github/workflows/ci.yml runs, so a green run here means a
# green check there.
#
# It exists because a pull request was reported locally verified and failed CI
# on `prettier --check`. The local run had been `pnpm typecheck` and `pnpm test`;
# CI runs six gates. Nothing was wrong with either command, and nothing said the
# other four existed — they are written down only in the workflow file, so
# anybody checking locally is guessing which ones matter. A note reminding
# people to run all six is not a fix. This is.
#
# The order below is CI's order, deliberately. Typecheck before lint before
# format means the failure you see first is the one furthest from cosmetic.
#
# Usage:
#   ./verify.sh                 the six gates CI runs
#   ./verify.sh --no-test       everything except the test suite (the fast half)
#   ./verify.sh --no-install    skip the lockfile check, for a tight edit loop
#
# On Windows, run it from Git Bash.
#
# What it does NOT prove, and neither does CI's green tick: that the gateway the
# apps use agrees with the backend. See "The contract suite" at the end.
set -euo pipefail

cd "$(dirname "$0")"

RUN_TESTS=1
RUN_INSTALL=1

for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TESTS=0 ;;
    --no-install) RUN_INSTALL=0 ;;
    -h|--help) sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

if [ "$RUN_TESTS" -eq 0 ]; then
  printf '\n\033[1mBuild, lint, formatting and parity verified. Tests skipped (--no-test).\033[0m\n'
  exit 0
fi

step "Test"
pnpm test

# ---------------------------------------------------------------------------
# The contract suite, and what this run did not prove.
#
# packages/api/src/contract is one set of assertions run against both
# implementations of the gateway interfaces. `pnpm test` runs it against the
# mock, offline. The live half needs a backend on a URL, and is off unless
# YALLA_CONTRACT_BASE_URL is set — in CI it is its own job against a container.
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

if [ -n "${YALLA_CONTRACT_BASE_URL:-}" ]; then
  printf 'Ran against a live backend at %s as well as the mock.\n' "$YALLA_CONTRACT_BASE_URL"
else
  cat <<'MESSAGE'
Ran against the MOCK ONLY. The live half did not run, so nothing above says the
gateway and the backend agree — only that the mock agrees with itself, which is
the failure the contract suite was written for.

To run both, with the backend up on 5086:

  YALLA_CONTRACT_BASE_URL=http://localhost:5086 ./verify.sh
MESSAGE
fi

printf '\n\033[1;32mVerified. This is what CI runs.\033[0m\n'
