import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Try `<specifier>.ts` when a relative import has no extension. */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExtension = /\.[a-z]+$/iu.test(specifier);

  if (isRelative && !hasExtension && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
