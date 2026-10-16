import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { waitForFontFaces, type FontFaceSetLike } from './fontFaces';

function browserFonts(): FontFaceSetLike | undefined {
  const doc = (globalThis as { document?: { fonts?: FontFaceSetLike } }).document;
  return doc?.fonts;
}

/**
 * True once the web build has the font files themselves, not only their rules.
 *
 * The static export puts the @font-face rules in the HTML, so `useFonts` says
 * "loaded" the moment the page hydrates — before the files arrive — and every
 * cold load painted serif text and empty icon boxes for a few seconds. Starts
 * true on a phone, where `useFonts` already waits for the files.
 */
export function useWebFontFaces(faces: readonly string[], registered: boolean): boolean {
  const [ready, setReady] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (ready || !registered) return;
    let cancelled = false;
    void waitForFontFaces(faces, browserFonts()).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // `faces` is a module constant at the one call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, registered]);
  return ready;
}
