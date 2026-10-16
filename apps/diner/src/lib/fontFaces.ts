/** The part of the browser's `document.fonts` this reads. */
export interface FontFaceSetLike {
  load(font: string): Promise<unknown>;
}

/** Long enough for a slow connection; short enough that a lost font never holds the app. */
const CEILING_MS = 3000;

/**
 * Settles once the browser has every face in `faces`, or after `ceilingMs`.
 *
 * A face that fails to load is not waited on: the app proceeds in the system
 * face, as it does on a phone when `useFonts` reports an error.
 */
export function waitForFontFaces(
  faces: readonly string[],
  fonts: FontFaceSetLike | undefined,
  ceilingMs: number = CEILING_MS,
): Promise<void> {
  if (!fonts || faces.length === 0) return Promise.resolve();
  const loaded = Promise.all(
    faces.map((face) => fonts.load(`16px "${face}"`).catch(() => undefined)),
  ).then(() => undefined);
  const ceiling = new Promise<void>((resolve) => setTimeout(resolve, ceilingMs));
  return Promise.race([loaded, ceiling]);
}
