/**
 * Resolve extensionless relative imports to `.ts` for plain Node.
 *
 * Node 24 strips types from `.ts` files natively but, unlike Vite and Metro,
 * will not guess an extension. Registering this hook lets the CSS generator
 * import the token source exactly as the apps do — no build step, no copy of
 * the values, and no `.ts` suffixes leaking into imports that every consuming
 * project would then have to be configured to accept.
 *
 * Used as `node --import ./scripts/register-ts.mjs <script>`.
 */
import { register } from 'node:module';

register(new URL('./resolve-ts-hook.mjs', import.meta.url));
