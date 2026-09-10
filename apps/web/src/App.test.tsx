// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { GatewayProvider } from '@yalla/api/react';
import { createQueryClient } from '@yalla/api';
import { I18nextProvider, NAMESPACES, i18next, initI18n } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { openStore } from './offline/idb';
import type { App as AppComponent } from './App';
import type { authSession as AuthSessionModule } from './auth/authSession';
import { createIdbTokenStorage } from './auth/tokenStorage';
import type { consoleGatewayFor as ConsoleGatewayFor } from './data/gateway';

/**
 * Where a sign-in link lands when the browser already holds a session.
 *
 * The case that broke the first design. A manager who has signed in on this
 * browser before — or who has just spent a previous link, which revokes every
 * session they had — holds a refresh token the server will now reject. The
 * console's startup refresh fails, the session broadcasts "signed out", and
 * the router's answer to that is to go to the sign-in form with the current
 * URL preserved in history state. For a link that is the plaintext token in
 * `history.state` and a password form in front of somebody who has no
 * password. The whole app is rendered here, against the real session module
 * and the real HTTP gateway, with `fetch` as the only double.
 */

let App: typeof AppComponent;
let authSession: typeof AuthSessionModule;
let consoleGatewayFor: typeof ConsoleGatewayFor;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'real');
  vi.stubEnv('VITE_API_URL', 'http://localhost:5086');
  await initI18n({
    resources,
    deviceLocales: ['en'],
    namespaces: NAMESPACES,
    defaultNamespace: 'admin',
  });
  ({ App } = await import('./App'));
  ({ authSession } = await import('./auth/authSession'));
  ({ consoleGatewayFor } = await import('./data/gateway'));
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await authSession.signOut();
});

function problem(status: number, code: string) {
  return new Response(
    JSON.stringify({ code, status, title: 'Problem', detail: code, type: 'about:blank' }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** A JWT-shaped token carrying the console's claims. Not signed; the client never verifies. */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'none' })}.${encode({ exp, ...claims })}.sig`;
}

function renderApp(url: string) {
  window.history.replaceState(null, '', url);
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider consoleGateway={consoleGatewayFor('owner')}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('opening a sign-in link', () => {
  it('reaches the password page past a refresh token the server rejects', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/venue/refresh')) return problem(401, 'token-rejected');
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    // A previous sign-in on this browser, whose access token has since run
    // out: the first request the console makes will be the refresh.
    await authSession.signIn({
      accessToken: 'access-stale',
      refreshToken: 'refresh-stale',
      expiresInSeconds: 0,
    });
    expect(await createIdbTokenStorage(openStore('auth')).read()).toBe('refresh-stale');
    expect(authSession.getState()).toBe('signedIn');

    renderApp('/reset-password#token=tok-stale-session');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /choose a password/i })).toBeTruthy(),
    );
    // The stale token really was tried and really was thrown out — this is
    // the scenario, not a browser with no session at all.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(authSession.getState()).toBe('signedOut');

    // And none of the sign-in machinery got hold of the page or the link.
    expect(screen.queryByRole('heading', { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByText(/session ended/i)).toBeNull();
    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.hash).toBe('');
    expect(JSON.stringify(window.history.state ?? null)).not.toContain('tok-stale-session');
  });

  it('shows a signed-in person the notice rather than a refusal page', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    // A live session: the token still has the claims the console reads.
    await authSession.signIn({
      accessToken: jwt({ staffMemberId: 'staff-1', role: 'Owner', venueId: 'v-1' }),
      refreshToken: 'refresh-live',
      expiresInSeconds: 900,
    });

    renderApp('/reset-password#token=tok-someone-elses');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /you are signed in as/i })).toBeTruthy(),
    );
    expect(screen.queryByRole('heading', { name: /choose a password/i })).toBeNull();
    expect(screen.queryByText(/you do not have access/i)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });
});
