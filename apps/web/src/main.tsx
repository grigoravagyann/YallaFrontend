import { ApiConfigError } from '@yalla/api';
import './base.css';
import { readConfig } from './config';
import { isPublicPath } from './publicRoutes';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

/**
 * Configuration is checked before anything else loads.
 *
 * `readConfig` throws on a missing or malformed base URL, and the failure has
 * to be *visible*: a blank page with an error in a console nobody has open is
 * the afternoon-wasting version. So the message is written straight into the
 * page, in plain DOM, and the app itself is only imported once the config is
 * known good — importing it earlier would evaluate the gateway and throw again.
 */
try {
  readConfig();
} catch (error) {
  if (error instanceof ApiConfigError) {
    const pre = document.createElement('pre');
    pre.className = 'config-error';
    pre.textContent = `Yalla cannot start.\n\n${error.message}\n\nSee apps/web/.env.example.`;
    container.replaceChildren(pre);
  }
  throw error;
}

/**
 * Two apps, one origin, and the choice is made here — before either is loaded.
 *
 * This branch is the code split. Both sides are dynamic imports, so a visitor
 * who opened `/lumen-coffee/northern-avenue` from a chat downloads the public
 * page and nothing else: no console shell, no counter screen, no offline queue,
 * no SignalR client, no venue-admin translations. Deciding inside a React
 * router instead would put all of it in one bundle and make the decision
 * cosmetic — `src/public/bundle.test.ts` asserts on the built chunk graph
 * precisely because "we import it lazily" is a claim about output, not source.
 *
 * `location.pathname` is read once, at startup. Neither app can navigate into
 * the other client-side, and that is correct rather than a limitation: they
 * share no session, no stylesheet and no audience, so a full page load at the
 * boundary is the honest cost of the boundary.
 */
if (isPublicPath(window.location.pathname)) {
  const { bootstrapPublic } = await import('./public/bootstrapPublic');
  await bootstrapPublic(container);
} else {
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(container);
}
