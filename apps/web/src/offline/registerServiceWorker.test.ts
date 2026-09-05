import { describe, expect, it, vi } from 'vitest';
import { scheduleServiceWorkerRegistration, type ServiceWorkerHost } from './registerServiceWorker';

/**
 * **Defect 1 of 4: the service worker never registered.**
 *
 * It shipped under a green suite because nothing could observe it. The old code
 * subscribed to `window.load` unconditionally, and `bootstrap` awaits i18n and
 * the stored session before calling it — both of which resolve *after* the
 * document is complete. So the listener was attached to an event that had
 * already fired, nothing was ever registered, and the app looked perfect right
 * up until somebody opened it in a basement.
 *
 * The failure is silent by construction: online, an app with no service worker
 * is indistinguishable from one with a working one. That is exactly why the
 * call site is asserted here rather than trusted.
 */

function host(over: Partial<ServiceWorkerHost> = {}): {
  host: ServiceWorkerHost;
  register: ReturnType<typeof vi.fn>;
  onLoad: ReturnType<typeof vi.fn>;
} {
  const register = vi.fn();
  const onLoad = vi.fn();
  return {
    register,
    onLoad,
    host: {
      production: true,
      supported: true,
      readyState: 'complete',
      register,
      onLoad,
      ...over,
    },
  };
}

describe('registering the service worker', () => {
  it('registers immediately when the document is already complete', () => {
    // The real case: `bootstrap` has awaited two promises, so `load` is long
    // gone by the time this runs.
    const { host: browser, register, onLoad } = host({ readyState: 'complete' });

    expect(scheduleServiceWorkerRegistration(browser)).toBe('registered');
    expect(register).toHaveBeenCalledTimes(1);
    // The specific regression: subscribing here registers nothing, ever.
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('waits for load only when the document genuinely has not finished', () => {
    const { host: browser, register, onLoad } = host({ readyState: 'loading' });

    expect(scheduleServiceWorkerRegistration(browser)).toBe('deferred');
    expect(register).not.toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledTimes(1);

    // And the subscription does register when the event arrives.
    (onLoad.mock.calls[0]?.[0] as () => void)();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('registers on an interactive document rather than waiting', () => {
    // `interactive` means DOMContentLoaded has fired and sub-resources are
    // still coming. `load` will still arrive, so deferring here is correct —
    // the point of the previous test's assertion is that `complete` is not
    // this case.
    const { host: browser, register, onLoad } = host({ readyState: 'interactive' });

    expect(scheduleServiceWorkerRegistration(browser)).toBe('deferred');
    expect(register).not.toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('does nothing in development or without support', () => {
    const dev = host({ production: false });
    expect(scheduleServiceWorkerRegistration(dev.host)).toBe('skipped');
    expect(dev.register).not.toHaveBeenCalled();

    const unsupported = host({ supported: false });
    expect(scheduleServiceWorkerRegistration(unsupported.host)).toBe('skipped');
    expect(unsupported.register).not.toHaveBeenCalled();
  });
});
