import type { ImageSourcePropType } from 'react-native';

/** What `PhotoImage` accepts: a URL, any React Native image source, or nothing. */
export type PhotoSource = string | ImageSourcePropType | null | undefined;

/**
 * Whether a source could ever load.
 *
 * A place with no photos hands over `undefined`, and an API row with a blank
 * URL hands over `''`. Neither fires `onError` on every platform — the web
 * build draws an empty box and waits — so `PhotoImage` must treat both as
 * failed before the first frame rather than after an error that never comes.
 */
export function hasPhotoSource(source: PhotoSource): boolean {
  if (source === null || source === undefined) return false;
  if (typeof source === 'string') return source.trim().length > 0;
  // A bundled asset: `require('./x.png')` is a number.
  if (typeof source === 'number') return true;
  if (Array.isArray(source)) return source.some((entry) => hasPhotoSource(entry));
  const uri = (source as { readonly uri?: unknown }).uri;
  return typeof uri === 'string' && uri.trim().length > 0;
}
