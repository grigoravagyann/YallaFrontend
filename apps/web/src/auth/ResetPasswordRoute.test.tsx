// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  UnauthorizedError,
  createConsoleMockGateway,
  createQueryClient,
  type ConsoleGateway,
  type ConsoleUser,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, NAMESPACES, i18next, initI18n } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { authSession as AuthSessionModule } from './authSession';
import type { ResetPasswordRoute as ResetPasswordRouteComponent } from './ResetPasswordRoute';

/**
 * The page a sign-in link opens.
 *
 * Rendered against the real session module and the real API client, with
 * `fetch` as the only double, because the claims worth making here are about
 * what leaves the browser and what is left behind in it: the token goes out
 * exactly once with nothing else attached, and it is gone from the address bar
 * and the history entry the moment it has been read.
 *
 * The session module reads its configuration at import, so the environment is
 * stubbed to a real backend first and the modules are imported after.
 */

const PASSWORD = 'correct horse battery staple';

let ResetPasswordRoute: typeof ResetPasswordRouteComponent;
let authSession: typeof AuthSessionModule;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'real');
  vi.stubEnv('VITE_API_URL', 'http://localhost:5086');
  await initI18n({
    resources,
    deviceLocales: ['en'],
    namespaces: NAMESPACES,
    defaultNamespace: 'admin',
  });
  ({ ResetPasswordRoute } = await import('./ResetPasswordRoute'));
  ({ authSession } = await import('./authSession'));
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await authSession.signOut();
});

function noContent() {
  return new Response(null, { status: 204 });
}

function problem(status: number, code: string, detail: string) {
  return new Response(
    JSON.stringify({ code, status, title: 'Problem', detail, type: 'about:blank', traceId: 't' }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Every request to the reset endpoint, as the server would have seen it. */
function resetRequests(fetchImpl: ReturnType<typeof vi.fn>) {
  return fetchImpl.mock.calls
    .filter(([url]) => String(url).endsWith('/api/auth/venue/reset-password'))
    .map((call) => {
      const [url, init] = call as [string, RequestInit];
      return {
        url,
        method: init.method,
        headers: init.headers as Headers,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      };
    });
}

/** The one request to the reset endpoint. Fails if there were none, or several. */
function sent(fetchImpl: ReturnType<typeof vi.fn>) {
  const requests = resetRequests(fetchImpl);
  expect(requests).toHaveLength(1);
  return requests[0]!;
}

const OWNER: ConsoleUser = {
  id: 'staff-owner',
  displayName: 'Ani Hakobyan',
  role: 'owner',
  scope: { venueId: 'v-lumen', branchIds: [] },
};

/**
 * A gateway whose idea of "who is signed in" follows the real session, so
 * signing out from the page is observed the way the console observes it.
 */
function gatewayFollowingSession(user: ConsoleUser): ConsoleGateway {
  return {
    ...createConsoleMockGateway({ latencyMs: 0 }),
    getCurrentUser: () =>
      authSession.getState() === 'signedIn'
        ? Promise.resolve(user)
        : Promise.reject(new UnauthorizedError({ url: '/api/auth/venue/refresh' })),
  };
}

function renderAt(url: string, gateway = gatewayFollowingSession(OWNER)) {
  window.history.replaceState(null, '', url);
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider consoleGateway={gateway}>
          <BrowserRouter>
            <ResetPasswordRoute />
          </BrowserRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

async function waitForForm() {
  await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeTruthy());
}

async function fillAndSubmit(password: string, confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^new password$/i), password);
  await user.type(screen.getByLabelText(/^repeat the password$/i), confirm);
  await user.click(screen.getByRole('button', { name: /save password/i }));
}

describe('the token in the link', () => {
  it('is taken from the address bar once and then removed from it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(noContent()));
    renderAt('/reset-password?token=tok-query#token=tok-fragment');
    await waitForForm();

    // Not merely "the form rendered": the address bar and the history entry
    // must not carry it, or the next person at this keyboard has the link.
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
    expect(JSON.stringify(window.history.state ?? null)).not.toContain('tok-');
  });

  it('is sent once, with the new password and nothing else attached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(noContent());
    vi.stubGlobal('fetch', fetchImpl);
    renderAt('/reset-password?token=tok-query#token=tok-fragment');
    await waitForForm();

    await fillAndSubmit(PASSWORD);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /password set/i })).toBeTruthy(),
    );
    const request = sent(fetchImpl);
    expect(request.url).toBe('http://localhost:5086/api/auth/venue/reset-password');
    expect(request.method).toBe('POST');
    // The fragment is the one the backend wrote; the query is only a fallback.
    expect(request.body).toEqual({ resetToken: 'tok-fragment', newPassword: PASSWORD });
    expect(request.headers.has('authorization')).toBe(false);
    // Nothing else left the browser: no refresh, no sign-in, no second try.
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Where to go next, and no form left to submit the spent link again.
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/sign-in');
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
  });

  it('is out of the address bar before the first request leaves', async () => {
    /*
     * The current-user query fires the moment it subscribes, ahead of the
     * passive effect that used to clean the address bar. A token in the query
     * — the fallback path — was therefore still in `document.URL` when the
     * refresh it triggers went out, and `document.URL` is what a Referer
     * header is made from. A fragment never travels in one; a query does.
     */
    const seen: string[] = [];
    const gateway: ConsoleGateway = {
      ...createConsoleMockGateway({ latencyMs: 0 }),
      getCurrentUser: () => {
        seen.push(window.location.href);
        return Promise.reject(new UnauthorizedError({ url: '/api/auth/venue/refresh' }));
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(noContent()));
    renderAt('/reset-password?token=tok-referer', gateway);
    await waitForForm();

    expect(seen.length).toBeGreaterThan(0);
    for (const href of seen) expect(href).not.toContain('tok-referer');
  });

  it('is read from the query when a chat app has dropped the fragment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(noContent());
    vi.stubGlobal('fetch', fetchImpl);
    renderAt('/reset-password?token=tok-query-only');
    await waitForForm();
    await waitFor(() => expect(window.location.search).toBe(''));

    await fillAndSubmit(PASSWORD);

    await waitFor(() => expect(resetRequests(fetchImpl)).toHaveLength(1));
    expect(sent(fetchImpl).body['resetToken']).toBe('tok-query-only');
  });

  it('is reported as unusable when the link carries none', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    renderAt('/reset-password');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /this link is no longer valid/i })).toBeTruthy(),
    );
    expect(screen.getByText(/ask the person who sent it/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    // Somebody who already has a password is not stranded on a dead link.
    expect(
      screen.getByRole('link', { name: 'I have a password, sign in' }).getAttribute('href'),
    ).toBe('/sign-in');
  });
});

describe('the console shell', () => {
  it('sends no Referer from any page, so a token in a query never reaches a log', () => {
    /*
     * Belt and braces to the strip above: whatever a deployment does with the
     * API's origin, no request from the console carries the page's URL.
     */
    const html = readFileSync(resolve(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="referrer" content="no-referrer" \/>/u);
  });
});

/** The ids an element's `aria-describedby` names. */
const describedBy = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);

/** The rule line under the fields that says `text`, and whether it reads as met. */
function rule(text: RegExp) {
  const item = screen.getAllByRole('listitem').find((li) => text.test(li.textContent ?? ''));
  expect(item, `a rule matching ${text}`).toBeTruthy();
  return { item: item!, met: /done/i.test(item!.textContent ?? '') };
}

describe('the password', () => {
  it('is refused under the minimum before anything is sent, on the field it is about', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    renderAt('/reset-password#token=tok-short');
    await waitForForm();

    await fillAndSubmit('too short');

    const field = screen.getByLabelText(/^new password$/i);
    // The cursor goes back to it, it reads as invalid, and the rules under the
    // fields are its description — the one about length says it is not met.
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const rules = screen.getByRole('list');
    expect(describedBy(field)).toContain(rules.id);
    const length = rule(/at least 12 characters/i);
    expect(length.met).toBe(false);
    expect(length.item.textContent).toMatch(/not yet/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('must be typed the same twice', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    renderAt('/reset-password#token=tok-twice');
    await waitForForm();

    await fillAndSubmit(PASSWORD, `${PASSWORD}!`);

    const repeat = screen.getByLabelText(/^repeat the password$/i);
    await waitFor(() => expect(document.activeElement).toBe(repeat));
    expect(repeat.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/^new password$/i).getAttribute('aria-invalid')).toBe('false');
    expect(describedBy(repeat)).toContain(screen.getByRole('list').id);
    expect(rule(/the two passwords match/i).met).toBe(false);
    expect(rule(/at least 12 characters/i).met).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('says how strong it is as it is typed', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderAt('/reset-password#token=tok-meter');
    await waitForForm();
    const field = screen.getByLabelText(/^new password$/i);
    const strength = () => {
      const id = describedBy(field).find((ref) => ref !== screen.getByRole('list').id);
      return document.getElementById(id!)?.textContent;
    };

    expect(strength()).toBe('Type at least 12 characters');
    const user = userEvent.setup();
    await user.type(field, 'short');
    expect(strength()).toBe('Too short');
    await user.clear(field);
    await user.type(field, 'abcdefghijkl');
    expect(strength()).toBe('Acceptable');
    await user.clear(field);
    await user.type(field, 'Abcdefgh1234');
    expect(strength()).toBe('Good');
    await user.clear(field);
    await user.type(field, PASSWORD);
    expect(strength()).toBe('Strong');
  });

  it('can be shown while it is typed, both fields together', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderAt('/reset-password#token=tok-eye');
    await waitForForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect((screen.getByLabelText(/^new password$/i) as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText(/^repeat the password$/i) as HTMLInputElement).type).toBe('text');
  });

  it("shows the server's own minimum when the server disagrees", async () => {
    // A deployment that raised the minimum. The client's 12 lets this through;
    // the server's sentence is what the person reads.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          problem(400, 'invalid-request', 'A password is at least 20 characters.'),
        ),
    );
    renderAt('/reset-password#token=tok-400');
    await waitForForm();

    await fillAndSubmit(PASSWORD);

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('A password is at least 20 characters.');
    const field = screen.getByLabelText(/^new password$/i);
    expect(describedBy(field)).toContain(error.id);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    // Still a form: the link is fine, only the password was not.
    expect(screen.getByRole('button', { name: /save password/i })).toBeTruthy();
  });
});

describe('a link the server refuses', () => {
  it('is reported as spent, not as a sign-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problem(401, 'reset-token-invalid', 'Ask for a new one.')),
    );
    renderAt('/reset-password#token=tok-spent');
    await waitForForm();

    await fillAndSubmit(PASSWORD);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /this link is no longer valid/i })).toBeTruthy(),
    );
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    // Nobody was signed in and nobody was signed out: no sign-in form, no
    // "your session ended".
    expect(screen.queryByRole('heading', { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByText(/session ended/i)).toBeNull();
  });

  it('reads as offline when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt('/reset-password#token=tok-offline');
    await waitForForm();

    await fillAndSubmit(PASSWORD);

    const error = await screen.findByRole('alert');
    expect(error.textContent).toMatch(/offline/i);
    // The link is not spent; the form stays for another go.
    expect(screen.getByRole('button', { name: /save password/i })).toBeTruthy();
  });
});

describe('somebody who is already signed in', () => {
  it('is told the link is not theirs and shown no form', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await authSession.signIn({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 });
    renderAt('/reset-password#token=tok-owner');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /signed in as ani hakobyan/i })).toBeTruthy(),
    );
    expect(screen.getByText(/opening it here would use it up/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    // The way back is to their own console, not into the link.
    expect(screen.getByRole('link', { name: 'Back to the console' }).getAttribute('href')).toBe(
      '/venue',
    );
    // And the address bar was still cleaned: the notice is not a reason to
    // leave the token where the next person can see it.
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('can sign out and leave the form, with the link intact, for its owner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(noContent());
    vi.stubGlobal('fetch', fetchImpl);
    await authSession.signIn({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 });
    renderAt('/reset-password#token=tok-handover');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /signed in as ani hakobyan/i })).toBeTruthy(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    // The address bar was cleaned before the sign-out, so the token has to
    // have survived in memory for the form to have anything to send.
    await waitForForm();
    expect(authSession.getState()).toBe('signedOut');
    await fillAndSubmit(PASSWORD);

    // Signing out revoked the session over the network; the reset is the only
    // other thing sent, and it carries the token read before the sign-out.
    await waitFor(() => expect(resetRequests(fetchImpl)).toHaveLength(1));
    expect(sent(fetchImpl).body['resetToken']).toBe('tok-handover');
    expect(sent(fetchImpl).headers.has('authorization')).toBe(false);
  });
});
