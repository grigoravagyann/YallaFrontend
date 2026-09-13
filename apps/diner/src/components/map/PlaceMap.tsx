/**
 * TypeScript's view of `./PlaceMap`.
 *
 * Metro never bundles this file: on the phone it resolves `./PlaceMap` to
 * `PlaceMap.native.tsx` and in the browser to `PlaceMap.web.tsx`, both of
 * which take precedence over a bare `.tsx`. `tsc` knows nothing of platform
 * suffixes, so without this the import from the map screen would not resolve.
 * The web stand-in is re-exported because it depends on nothing native, so
 * any tool that does land here (a test runner, say) still gets a working map.
 */
export { PlaceMap } from './PlaceMap.web';
export type { PlaceMapHandle, PlaceMapProps } from './types';
