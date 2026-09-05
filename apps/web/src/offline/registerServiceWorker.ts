/**
 * Register the service worker that lets the staff screen open without a network.
 *
 * Production only. In development Vite serves unhashed modules and rewrites
 * them on every edit, so a worker caching them would fight HMR and hand you
 * yesterday's component. To exercise the PWA, build and preview:
 *
 *     pnpm build:web && pnpm --filter @yalla/web preview
 *
 * Failure here is deliberately non-fatal: an uninstallable app that works is
 * strictly better than a blank page, and the reason is worth seeing in the
 * console rather than swallowed.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('[pwa] service worker registration failed', error);
    });
  };

  // `load` has usually already fired by the time this runs: `bootstrap` awaits
  // i18n and the stored session first, and both resolve after the document is
  // complete. Waiting for an event that has been and gone registered nothing at
  // all — the app worked perfectly online and simply never installed a worker,
  // so the one thing the worker exists for, opening the floor in a basement,
  // silently did not happen. Register now if the document is ready, and only
  // subscribe if it genuinely is not.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
