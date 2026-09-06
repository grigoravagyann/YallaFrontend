import { common } from './bundles/common';
import { diner } from './bundles/diner';

/**
 * What the phone app loads: `common` and `diner`. Nothing else.
 *
 * The app already told i18next it wanted only these two namespaces — and then
 * imported the whole resource map, which is a different statement made to a
 * different tool. i18next registering two namespaces does not stop Metro
 * bundling five: the import is what decides what ships, and `resources.ts`
 * statically pulls in `admin`, `staff` and `public` for three languages each.
 *
 * That is about 149 kB of JSON — 80 kB of venue-console copy, 58 kB of
 * counter-screen copy, 11 kB of public-page copy — inside an app binary that
 * renders none of it. Measured on the Android Hermes bundle, narrowing the
 * import took it from 4,864,388 to 4,750,799 bytes: **113.6 kB**, with every
 * admin, staff and public string verifiably gone from the binary.
 *
 * The comment that used to sit here said Metro has no tree-shaking worth
 * relying on. That is exactly the reason this file exists rather than a reason
 * not to have it: when the bundler will not narrow the graph, the import has
 * to. Telling i18next to register two namespaces never narrowed anything —
 * that is a statement to a different tool, made after the bundle is built.
 *
 * The same fix `resources.public.ts` already applies for the web page. See
 * `src/bundles/README.md`.
 */
export const dinerResources = {
  hy: { common: common.hy, diner: diner.hy },
  ru: { common: common.ru, diner: diner.ru },
  en: { common: common.en, diner: diner.en },
} as const;

export const DINER_NAMESPACES = ['common', 'diner'] as const;
