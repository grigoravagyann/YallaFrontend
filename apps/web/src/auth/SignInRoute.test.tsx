// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createQueryClient } from '@yalla/api';
import { I18nextProvider, NAMESPACES, i18next, initI18n } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { authSession as AuthSessionModule } from './authSession';
import type { SignInRoute as SignInRouteComponent } from './SignInRoute';

/**
 * The sign-in page (SignIn artboard): the form, its field errors, the two
 * refusals the server can give — wrong credentials and too many attempts —
 * the forgotten-password view, and where signing in lands.
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

const EMAIL = 'ani@lumen.am';
const PASSWORD = 'correct horse battery staple';

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

function problem(status: number, code: string, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify({ code, status, title: 'Problem', detail: code, type: 'about:blank' }),
    { status, headers: { 'content-type': 'application/problem+json', ...headers } },
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderSignIn(fetchImpl: ReturnType<typeof vi.fn>, returnTo = '/venue') {
  vi.stubGlobal('fetch', fetchImpl);
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
  return userEvent.setup();
}

const email = () => screen.getByLabelText(/^email$/i) as HTMLInputElement;
const password = () => screen.getByLabelText(/^password$/i) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^sign in$/i });

/** The ids an element's `aria-describedby` names. */
const describedBy = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);

async function signInFrom(returnTo: string) {
  const user = renderSignIn(vi.fn().mockResolvedValue(signedIn()), returnTo);
  await user.type(email(), EMAIL);
  await user.type(password(), PASSWORD);
  await user.click(submit());

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

  it('says welcome while the console opens, with a way straight in', async () => {
    const user = renderSignIn(vi.fn().mockResolvedValue(signedIn()), '/venue/menu');
    await user.type(email(), EMAIL);
    await user.type(password(), PASSWORD);
    await user.click(submit());

    const welcome = await screen.findByRole('status');
    expect(welcome.textContent).toMatch(/welcome/i);
    await user.click(screen.getByRole('link', { name: 'Go to the console' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/venue/menu'));
  });
});

describe('the form', () => {
  it('refuses an empty submit under each field, focuses the first, and sends nothing', async () => {
    const fetchImpl = vi.fn();
    const user = renderSignIn(fetchImpl);
    await user.click(submit());

    expect(document.activeElement).toBe(email());
    expect(email().getAttribute('aria-invalid')).toBe('true');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    const emailError = screen.getByText('Enter your email');
    const passwordError = screen.getByText('Enter your password');
    expect(describedBy(email())).toContain(emailError.id);
    expect(describedBy(password())).toContain(passwordError.id);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names a malformed address and moves to the password when only it is missing', async () => {
    const fetchImpl = vi.fn();
    const user = renderSignIn(fetchImpl);
    await user.type(email(), 'ani@lumen');
    await user.click(submit());
    expect(screen.getByText(/does not look right, for example name@yalla.am/i)).toBeTruthy();
    expect(document.activeElement).toBe(email());

    await user.clear(email());
    await user.type(email(), EMAIL);
    await user.click(submit());
    expect(email().getAttribute('aria-invalid')).toBe('false');
    expect(document.activeElement).toBe(password());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shows and hides the password with a pressed toggle', async () => {
    const user = renderSignIn(vi.fn());
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password().type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await user.click(toggle);
    expect(password().type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('warns when Caps Lock is on while typing the password', () => {
    renderSignIn(vi.fn());
    fireEvent.keyUp(password(), { key: 'A', modifierCapsLock: true });
    const hint = screen.getByText('Caps Lock is on');
    expect(describedBy(password())).toContain(hint.id);

    fireEvent.keyUp(password(), { key: 'a' });
    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });
});

describe('a refusal', () => {
  it('for a wrong password is announced, clears the password and puts the cursor back in it', async () => {
    const user = renderSignIn(vi.fn().mockResolvedValue(problem(401, 'invalid-credentials')));
    await user.type(email(), EMAIL);
    await user.type(password(), 'wrong password');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The email or password is wrong. Check them and try again.');
    expect(password().value).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(password()));
    expect(email().getAttribute('aria-invalid')).toBe('true');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('for too many attempts says how long to wait, and sends nothing more until then', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(429, 'rate-limited', { 'retry-after': '900' }));
    const user = renderSignIn(fetchImpl);
    await user.type(email(), EMAIL);
    await user.type(password(), PASSWORD);
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Too many failed attempts. Try again in 15 minutes, or reset your password.',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await user.click(submit());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('for too many attempts with no wait named does not invent one', async () => {
    const user = renderSignIn(vi.fn().mockResolvedValue(problem(429, 'rate-limited')));
    await user.type(email(), EMAIL);
    await user.type(password(), PASSWORD);
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Too many failed attempts. Try again in a few minutes, or reset your password.',
    );
  });

  it('for a dead connection reads as offline, not as a wrong password', async () => {
    const user = renderSignIn(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await user.type(email(), EMAIL);
    await user.type(password(), PASSWORD);
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/offline/i);
    expect(password().value).toBe(PASSWORD);
  });
});

describe('a forgotten password', () => {
  function resetRequests(fetchImpl: ReturnType<typeof vi.fn>) {
    return fetchImpl.mock.calls
      .filter(([url]) => String(url).endsWith('/api/auth/venue/request-password-reset'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as unknown);
  }

  it('asks for the address, keeps what was typed, and sends one request in this language', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const user = renderSignIn(fetchImpl);
    await user.type(email(), EMAIL);
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
    expect(email().value).toBe(EMAIL);
    await waitFor(() => expect(document.activeElement).toBe(email()));

    await user.click(screen.getByRole('button', { name: 'Send the link' }));
    const sent = await screen.findByRole('status');
    expect(sent.textContent).toMatch(/if there is an account at this address/i);
    expect(resetRequests(fetchImpl)).toEqual([{ email: EMAIL, localeCode: 'en' }]);
  });

  it('refuses an empty address under the field', async () => {
    const fetchImpl = vi.fn();
    const user = renderSignIn(fetchImpl);
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await user.click(screen.getByRole('button', { name: 'Send the link' }));

    const error = screen.getByText('Enter your email');
    expect(describedBy(email())).toContain(error.id);
    expect(email().getAttribute('aria-invalid')).toBe('true');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('goes back to the sign-in form with the cursor in the address', async () => {
    const user = renderSignIn(vi.fn());
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email()));
  });
});

describe('the language', () => {
  it('can be chosen on the sign-in page', () => {
    renderSignIn(vi.fn());
    const picker = screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual(['hy', 'ru', 'en']);
    expect(picker.value).toBe('en');
  });
});
