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

/**
 * Everything about the browser this decision depends on.
 *
 * Extracted so the decision itself can be tested. The bug this exists to
 * prevent shipped invisible under a green suite precisely because it was
 * unreachable: `registerServiceWorker` read `import.meta.env`, `navigator` and
 * `document` directly, so nothing could ask it what it would do.
 */
export interface ServiceWorkerHost {
  readonly production: boolean;
  readonly supported: boolean;
  /** `document.readyState` at the moment registration is attempted. */
  readonly readyState: DocumentReadyState;
  register(): void;
  /** Subscribe to `load`. Only ever called when the document is not yet ready. */
  onLoad(handler: () => void): void;
}

export type RegistrationOutcome =
  /** Registered immediately, because the document was already complete. */
  | 'registered'
  /** Subscribed to `load`, because the document genuinely has not finished. */
  | 'deferred'
  /** Development, or a browser with no service workers. */
  | 'skipped';

/**
 * When to register, given a browser.
 *
 * **`load` has usually already fired by the time this runs.** `bootstrap`
 * awaits i18n and the stored session first, and both resolve after the document
 * is complete. Waiting for an event that has been and gone registered nothing at
 * all — the app worked perfectly online and simply never installed a worker, so
 * the one thing the worker exists for, opening the floor in a basement, silently
 * did not happen. Register now if the document is ready, and only subscribe if
 * it genuinely is not.
 */
export function scheduleServiceWorkerRegistration(host: ServiceWorkerHost): RegistrationOutcome {
  if (!host.production) return 'skipped';
  if (!host.supported) return 'skipped';

  if (host.readyState === 'complete') {
    host.register();
    return 'registered';
  }

  host.onLoad(() => host.register());
  return 'deferred';
}

export function registerServiceWorker(): RegistrationOutcome {
  return scheduleServiceWorkerRegistration({
    production: import.meta.env.PROD,
    supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    readyState: typeof document === 'undefined' ? 'loading' : document.readyState,
    register: () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        console.warn('[pwa] service worker registration failed', error);
      });
    },
    onLoad: (handler) => window.addEventListener('load', handler, { once: true }),
  });
}
