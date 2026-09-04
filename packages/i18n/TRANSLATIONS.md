# Translation status

## Armenian and Russian copy here is PROVISIONAL

The `hy` and `ru` files contain only the handful of strings the placeholder app
shells need to boot. They were written to get the shells rendering, **not** by a
native speaker, and they have not been reviewed.

They exist at all for one structural reason: `hy` is the fallback language. A key
missing from `hy` has nothing to fall back to and renders as its raw key path in
production, so the fallback bundle cannot be left empty the way `ru` or `en`
could be.

**Before launch, a native Armenian speaker and a native Russian speaker must
review every string in `src/locales/hy` and `src/locales/ru`.**

No string beyond the shell set has been machine-translated, and none should be.
An empty file is a visible gap; a plausible-looking wrong translation is an
invisible one that never gets revisited.

## Adding a key

1. Add it to `src/locales/hy/<namespace>.json` first — `hy` is the reference
   bundle that `pnpm i18n:check` compares the others against.
2. Add the same key path to `ru` and `en`.
3. Run `pnpm i18n:check`. It fails on a key present in one language and absent
   in another, on a key present in a translation but not in `hy`, and on any
   empty string value.

`pnpm i18n:check` deliberately does not let you "fill in later" with `""` — an
empty value renders as blank rather than falling back, which reads as a broken
screen.
