// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createQueryClient } from '@yalla/api';
import { I18nextProvider, NAMESPACES, i18next, initI18n } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { authSession as AuthSessionModule } from './authSession';
import type { SignInRoute as SignInRouteComponent } from './SignInRoute';

/**
 * Where signing in lands.
 *
 * `returnTo` is how a manager who lost their session mid-floor-plan gets back
 * to the floor plan. It must not be how a signed-in person gets sent to the
 * password page a sign-in link opens: that page belongs to the link's holder,
 * and a session-driven bounce into it is the one route by which the URL of
 * somebody else's link could end up in this person's history.
 */

let SignInRoute: typeof SignInRouteComponent;
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
  ({ SignInRoute } = await import('./SignInRoute'));
  ({ authSession } = await import('./authSession'));
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await authSession.signOut();
});

function signedIn() {
  return new Response(
    JSON.stringify({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresInSeconds: 900,
      staffMemberId: 'staff-1',
      venueId: 'v-1',
      role: 1,
      fullName: 'Ani Hakobyan',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

async function signInFrom(returnTo: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(signedIn()));
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/sign-in', state: { returnTo } }]}>
          <Routes>
            <Route path="/sign-in" element={<SignInRoute />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );

  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^email$/i), 'ani@lumen.am');
  await user.type(screen.getByLabelText(/^password$/i), 'correct horse battery staple');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));

  await waitFor(() => expect(screen.getByTestId('where')).toBeTruthy());
  return screen.getByTestId('where').textContent;
}

describe('after signing in', () => {
  it('goes back to where the person was', async () => {
    expect(await signInFrom('/venue/floorplan')).toBe('/venue/floorplan');
  });

  it("never goes to the password page a sign-in link opens, even if that is where they 'were'", async () => {
    expect(await signInFrom('/reset-password')).toBe('/');
  });
});
