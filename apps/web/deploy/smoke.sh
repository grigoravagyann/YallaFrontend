#!/usr/bin/env bash
#
# Smoke test for the web image: runs it, then asserts what "Hosting the web
# app" in the README promises — the SPA fallback, the cache headers, and that
# the Content-Security-Policy header equals the policy the build wrote and
# names the API origin the image was built for.
#
#   apps/web/deploy/smoke.sh <image> <the VITE_API_URL it was built with> [host port]
#
# Needs docker and curl. Exits 0 only when every check passes.
set -euo pipefail

IMAGE="${1:?image tag}"
API_URL="${2:?the VITE_API_URL the image was built with}"
PORT="${3:-18080}"
NAME="yalla-web-smoke-$$"

docker run -d --rm --name "$NAME" -p "127.0.0.1:${PORT}:80" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

BASE="http://127.0.0.1:${PORT}"
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "$BASE/" 2>/dev/null; then break; fi
  sleep 0.5
done

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
ok() { printf 'ok: %s\n' "$*"; }

status_of() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
header_of() {
  curl -sI "$BASE$1" | tr -d '\r' | awk -v h="$(printf '%s' "$2" | tr 'A-Z' 'a-z')" '
    { line = $0; name = tolower(line); sub(/:.*/, "", name) }
    name == h { sub(/^[^:]*:[ \t]*/, "", line); print line }'
}

# The policy, straight out of the image rather than from a rebuild.
EXPECTED_CSP="$(docker run --rm --entrypoint cat "$IMAGE" /srv/content-security-policy.txt | tr -d '\r\n')"
[ -n "$EXPECTED_CSP" ] || fail "no /srv/content-security-policy.txt in the image"

# 1. The shell.
[ "$(status_of /)" = 200 ] || fail "GET / is not 200"
curl -s "$BASE/" | grep -q '<div id="root">' || fail "GET / is not the app shell"
ok "/ serves index.html"

# 2. A deep client-side route is the same shell: 200, not 404, and no-cache.
[ "$(status_of /venue/floorplan)" = 200 ] || fail "deep route is not 200"
curl -s "$BASE/venue/floorplan" | grep -q '<div id="root">' || fail "deep route is not the app shell"
case "$(header_of /venue/floorplan Cache-Control)" in
  *no-cache*) ok "/venue/floorplan falls back to index.html, Cache-Control: no-cache" ;;
  *) fail "deep route lacks Cache-Control: no-cache" ;;
esac

# 2b. A manage link is the shell too, and asks not to be indexed.
case "$(header_of /booking/smoke-token X-Robots-Tag)" in
  *noindex*) ok "/booking/* carries X-Robots-Tag: noindex" ;;
  *) fail "/booking/* lacks X-Robots-Tag: noindex" ;;
esac
case "$(header_of /venue/floorplan X-Robots-Tag)" in
  '') ok "other routes carry no X-Robots-Tag" ;;
  *) fail "X-Robots-Tag leaked onto /venue/floorplan" ;;
esac

# 3. A real hashed asset, long-cached.
ASSET="$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"
[ -n "$ASSET" ] || fail "index.html references no /assets/*.js"
[ "$(status_of "$ASSET")" = 200 ] || fail "$ASSET is not 200"
case "$(header_of "$ASSET" Cache-Control)" in
  *immutable*) ok "$ASSET is immutable" ;;
  *) fail "$ASSET lacks an immutable Cache-Control" ;;
esac

# 4. A chunk that does not exist is a 404, never the shell parsed as script.
[ "$(status_of /assets/does-not-exist.js)" = 404 ] || fail "missing asset is not a 404"
ok "missing /assets file is 404"

# 5. The manifest and the service worker exist and are not long-cached.
for p in /manifest.webmanifest /sw.js; do
  [ "$(status_of "$p")" = 200 ] || fail "$p is not 200"
  case "$(header_of "$p" Cache-Control)" in
    *no-cache*) ok "$p is no-cache" ;;
    *) fail "$p lacks Cache-Control: no-cache" ;;
  esac
done

# 6. The CSP header equals the build's policy and carries the API origin.
GOT_CSP="$(header_of / Content-Security-Policy)"
[ "$GOT_CSP" = "$EXPECTED_CSP" ] || fail "Content-Security-Policy header differs from content-security-policy.txt
  header: $GOT_CSP
  file:   $EXPECTED_CSP"
ok "Content-Security-Policy header equals content-security-policy.txt"

API_ORIGIN="$(printf '%s' "$API_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
case "$GOT_CSP" in
  *"connect-src 'self' ${API_ORIGIN} "*) ok "connect-src carries ${API_ORIGIN}" ;;
  *) fail "connect-src does not carry ${API_ORIGIN}: $GOT_CSP" ;;
esac
case "$GOT_CSP" in
  *"frame-ancestors 'none'"*) ok "frame-ancestors 'none' is in the header" ;;
  *) fail "frame-ancestors 'none' missing from the header" ;;
esac

# 7. The other headers.
[ "$(header_of / X-Content-Type-Options)" = nosniff ] || fail "X-Content-Type-Options missing"
[ "$(header_of / Referrer-Policy)" = no-referrer ] || fail "Referrer-Policy missing"
ok "X-Content-Type-Options and Referrer-Policy set"

printf 'smoke: all checks passed for %s\n' "$IMAGE"
