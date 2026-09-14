/**
 * The console's Content-Security-Policy, written once.
 *
 * Two consumers, one string. The build puts it on the static shell as a
 * `<meta http-equiv>` (the `yalla:csp` plugin in `vite.config.ts`), and the
 * same text is written to `dist/content-security-policy.txt` for whoever hosts
 * the bundle to send as a `Content-Security-Policy` response header. The header
 * is the stronger of the two: browsers ignore `frame-ancestors` in a meta tag,
 * so only the header stops the console being framed. Both are kept so the
 * policy is on the page even where nobody configured the host yet.
 *
 * Why it matters here: the refresh token lives in IndexedDB, which any script
 * on the origin can read (`src/auth/tokenStorage.ts`). The defence is that no
 * foreign script runs — `script-src 'self'` with no inline script and no
 * `eval` — and that the page talks to nothing but itself and the API.
 *
 * Pure and dependency-free on purpose: `vite.config.ts` imports it in Node at
 * build time, and a test can call it without building anything.
 */

export interface ContentSecurityPolicyOptions {
  /**
   * The backend the console calls (`VITE_API_URL`). Its origin is allowed for
   * requests and images — photos are served from `/api/photos/…` on it — and
   * its WebSocket twin for the live floor. Absent (a mock build), the page may
   * reach only itself.
   */
  readonly apiUrl?: string | null | undefined;
}

/** `https://api.example:8443/x` → `https://api.example:8443`; null for a blank or unparseable value. */
export function originOf(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (trimmed === '') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** The WebSocket origin SignalR uses for an http(s) origin: `http` → `ws`, `https` → `wss`. */
function webSocketOriginOf(origin: string): string {
  return origin.replace(/^http/u, 'ws');
}

export function contentSecurityPolicy(options: ContentSecurityPolicyOptions = {}): string {
  const api = originOf(options.apiUrl);
  const connect = api ? ["'self'", api, webSocketOriginOf(api)] : ["'self'"];
  /*
   * `https:` for images, on purpose. Photos migrated from the old
   * `MenuItems.PhotoUrl` column are rows marked externally hosted, and the API
   * hands their absolute URLs (any CDN a venue once pasted) out unchanged. An
   * image cannot run script or read the token store, so allowing any https
   * image host costs little, and leaving it out blanks every legacy dish photo.
   */
  const images = ["'self'", 'data:', 'blob:', ...(api ? [api] : []), 'https:'];

  const directives: readonly (readonly [string, readonly string[]])[] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'"]],
    ['connect-src', connect],
    ['img-src', images],
    // React Native Web writes its styles into a <style> element at runtime.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
  ];

  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
