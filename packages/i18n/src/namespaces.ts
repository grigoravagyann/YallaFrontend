/**
 * The namespace names, with no bundle attached.
 *
 * Its own module so `init.ts` can name a default without importing
 * `resources.ts`, which would statically pull every language of every surface
 * into whichever app called `initI18n`. See `src/bundles/README.md`.
 */
export const NAMESPACES = ['common', 'diner', 'public', 'staff', 'admin'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';
