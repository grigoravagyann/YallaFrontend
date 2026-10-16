/** Keys shared by the phone's keychain store and the web build's localStorage. */
export const TAB_TOKENS_KEY = 'yalla.diner.tabTokens';
export const ACTIVE_TAB_KEY = 'yalla.diner.activeTab';

/**
 * The most tabs whose tokens are kept. A diner is on one table at a time; a
 * few covers a table change in one evening, and keeps the keychain entry well
 * under the size the iOS keychain is comfortable with.
 */
const MAX_TABS = 3;

/** tabId → token, the newest last, cut to the latest {@link MAX_TABS}. */
export function encodeTabTokens(tokens: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(tokens).slice(-MAX_TABS)));
}

/** Anything unreadable is no tokens: the cost is a re-scan, never a crash. */
export function decodeTabTokens(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [tabId, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token === 'string' && token !== '') out[tabId] = token;
    }
    return out;
  } catch {
    return {};
  }
}
