import { ApiConfigError } from '@yalla/api';
import { readConfig } from './config';
import './index.css';

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
    pre.textContent = `Yalla console cannot start.\n\n${error.message}\n\nSee apps/web/.env.example.`;
    container.replaceChildren(pre);
  }
  throw error;
}

const { bootstrap } = await import('./bootstrap');
await bootstrap(container);
