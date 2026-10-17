/**
 * The browser build of `haptics.ts`: browsers have no taptic engine worth the
 * name, so every touch is a no-op. Vitest resolves `.web.ts` first, which also
 * keeps the native module out of every test.
 */
export const haptics = {
  select(): void {},
  success(): void {},
  tap(): void {},
};
