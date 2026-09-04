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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('[pwa] service worker registration failed', error);
    });
  });
}
