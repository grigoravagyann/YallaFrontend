/// <reference types="node" />
// Scoped to this file rather than added to the app's `tsconfig`: this is a
// build-time assertion about a source file, and a React Native app should not
// have Node's globals in scope everywhere just because one test reads a file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DINER_NAMESPACES, dinerResources } from '@yalla/i18n/diner';
import { describe, expect, it } from 'vitest';

/**
 * The phone app ships its own copy and nobody else's.
 *
 * `apps/web` was fixed for this and the phone app was not, so the binary
 * carried the venue console's 80 kB of copy and the counter screen's 58 kB in
 * three languages each — for screens a diner has no route to. Narrowing the
 * import took the Android Hermes bundle from 4,864,388 to 4,750,799 bytes.
 *
 * The trap this guards is specific and easy to fall back into: the app was
 * *already* passing `namespaces: ['common', 'diner']` to i18next, which reads
 * like the narrowing is done. It is not. i18next decides what is registered at
 * runtime; the **import** decides what Metro puts in the binary, and Metro does
 * not tree-shake a resource map. So the assertions below are about the import
 * graph, not about what i18next was told.
 */

const entryPoint = fileURLToPath(new URL('./i18n.ts', import.meta.url));

describe('the diner i18n entry point', () => {
  it('takes the narrow resource map, not the whole one', () => {
    const source = readFileSync(entryPoint, 'utf8');

    expect(source).toContain("from '@yalla/i18n/diner'");
    // The one import that would quietly put all five namespaces back.
    expect(source, 'the phone app is importing every surface’s copy again').not.toContain(
      "from '@yalla/i18n/resources'",
    );
  });

  it('carries only the two namespaces the app renders', () => {
    expect([...DINER_NAMESPACES]).toEqual(['common', 'diner']);

    for (const [locale, bundle] of Object.entries(dinerResources)) {
      expect(Object.keys(bundle).sort(), `${locale} carries a namespace it never renders`).toEqual([
        'common',
        'diner',
      ]);
    }
  });

  it('reaches no admin, staff or public copy at all', () => {
    // Asserted on the values rather than the keys, because a namespace could be
    // merged into `diner` under a different name and keys alone would miss it.
    const serialised = JSON.stringify(dinerResources);

    expect(serialised).not.toContain('Try a different name, or clear the search.'); // admin
    expect(serialised).not.toContain('Waiting to sync. The kitchen cannot see this yet.'); // staff
    expect(serialised).not.toContain('We could not find that place'); // public

    // And the copy it does need is genuinely there, so the test cannot pass by
    // the map being empty.
    expect(serialised).toContain('Someone is sitting here right now.');
  });

  it('has all three languages, so a tourist is not dropped to Armenian', () => {
    expect(Object.keys(dinerResources).sort()).toEqual(['en', 'hy', 'ru']);
  });
});
