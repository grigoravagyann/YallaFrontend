import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * The service worker's Web Push half (staff phone, `docs/notifications.md`
 * §6a): the real `public/sw.js`, evaluated in a stub of the worker global, is
 * handed a push and a tap.
 *
 * - a push becomes a notification with the server's words and its collapse
 *   tag, carrying where a tap goes;
 * - a link that is not the staff app's is not followed;
 * - a tap focuses an open staff window and tells it where to go — no reload
 *   over a half-entered order — or opens one.
 */

const SW_SOURCE = readFileSync(resolve(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://timetoeat.example';

type Handler = (event: unknown) => void;

function loadWorker(windows: { url: string }[] = []) {
  const handlers = new Map<string, Handler>();
  const showNotification = vi.fn(async () => undefined);
  const clients = windows.map((window) => ({
    url: window.url,
    postMessage: vi.fn(),
    focus: vi.fn(async () => undefined),
  }));
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { showNotification },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => clients),
      openWindow: vi.fn(async () => undefined),
    },
  };
  const run = new Function('self', 'caches', 'fetch', SW_SOURCE) as (...args: unknown[]) => void;
  run(self, { open: vi.fn(), keys: vi.fn(async () => []), match: vi.fn() }, vi.fn());

  async function dispatch(type: string, event: Record<string, unknown>): Promise<void> {
    let waited: Promise<unknown> = Promise.resolve();
    handlers.get(type)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        waited = promise;
      },
    });
    await waited;
  }

  return { self, clients, showNotification, dispatch };
}

const pushOf = (data: unknown) => ({
  data: { json: () => data, text: () => JSON.stringify(data) },
});

describe('a staff push', () => {
  it('shows the server’s words, collapsed by its tag, with the link it opens', async () => {
    const worker = loadWorker();
    await worker.dispatch(
      'push',
      pushOf({
        title: 'Table 2 · asking for the bill',
        body: 'The guests are ready to pay',
        url: '/staff/now?call=sr1',
        tag: 'call:t2',
        kind: 'tableCalls',
      }),
    );
    expect(worker.showNotification).toHaveBeenCalledWith(
      'Table 2 · asking for the bill',
      expect.objectContaining({
        body: 'The guests are ready to pay',
        tag: 'call:t2',
        renotify: true,
        data: { url: '/staff/now?call=sr1', kind: 'tableCalls' },
      }),
    );
    // Android draws a badge from its alpha alone; both icons are opaque, so
    // either would be a white tile in the status bar.
    const calls = worker.showNotification.mock.calls as unknown as [string, object][];
    expect(calls[0]![1]).not.toHaveProperty('badge');
  });

  it('never follows a link out of the staff app', async () => {
    const worker = loadWorker();
    await worker.dispatch('push', pushOf({ title: 'x', body: 'y', url: 'https://evil.example/' }));
    await worker.dispatch('push', pushOf({ title: 'x', body: 'y', url: '/venue/staff' }));
    const urls = worker.showNotification.mock.calls.map(
      (call) => (call as unknown as [string, { data: { url: string } }])[1].data.url,
    );
    expect(urls).toEqual(['/staff', '/staff']);
  });
});

describe('tapping one', () => {
  it('focuses an open staff window and tells it where to go', async () => {
    const worker = loadWorker([{ url: `${ORIGIN}/venue` }, { url: `${ORIGIN}/staff/messages` }]);
    const close = vi.fn();
    await worker.dispatch('notificationclick', {
      notification: { close, data: { url: '/staff/approve/r1' } },
    });
    expect(close).toHaveBeenCalled();
    const staff = worker.clients[1]!;
    expect(staff.postMessage).toHaveBeenCalledWith({
      type: 'staff-push-open',
      url: '/staff/approve/r1',
    });
    expect(staff.focus).toHaveBeenCalled();
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens the link when no staff window is open', async () => {
    const worker = loadWorker([{ url: `${ORIGIN}/venue` }]);
    await worker.dispatch('notificationclick', {
      notification: { close: vi.fn(), data: { url: '/staff/floor?table=t1' } },
    });
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith('/staff/floor?table=t1');
  });
});
