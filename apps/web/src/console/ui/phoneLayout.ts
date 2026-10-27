import { consoleMedia } from '@yalla/tokens';
import { useSyncExternalStore } from 'react';

/**
 * The console's phone layout (`consoleMedia.phone`, max-width 799px): the
 * sidebar is a top bar and a drawer, and tables are cards. The stylesheets
 * repeat the query text, since a media query cannot read a custom property.
 */
export const PHONE_QUERY = consoleMedia.phone;

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const list = window.matchMedia(PHONE_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/**
 * Whether the console is in its phone layout now, following a rotation or a
 * resized window. Where the browser cannot say (a test, an old browser) the
 * answer is yes: the phone controls are the ones that must not be dead.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia !== 'function' || window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
