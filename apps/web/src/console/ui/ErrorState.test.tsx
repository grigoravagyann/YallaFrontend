// @vitest-environment jsdom
import { I18nextProvider, i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../venue/reports/testHarness';
import { ErrorState, errorKindFor, type ErrorStateProps } from './ErrorState';

/**
 * The five shared error states from the Errors artboard: 404, 403, offline,
 * session ended and server error. Each says what happened, that nothing was
 * changed where that is true, and offers the one way out that fits.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function SignInProbe() {
  const location = useLocation();
  return (
    <p data-testid="sign-in">{(location.state as { returnTo?: string } | null)?.returnTo ?? ''}</p>
  );
}

function renderState(props: ErrorStateProps, at = '/platform/venues/v-gone') {
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/sign-in" element={<SignInProbe />} />
          <Route path="*" element={<ErrorState {...props} />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('the shared error states', () => {
  it('404 names the venue, points at the Deleted filter and offers the list and Home', () => {
    renderState({ kind: 'notFound' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'This venue was not found' }),
    ).toBeTruthy();
    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByText(/deleted.*filter/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Venues list' }).getAttribute('href')).toBe(
      '/platform/venues',
    );
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/platform');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('403 says nothing changed and goes back to where the person can go', () => {
    renderState({ kind: 'forbidden', homeTo: '/venue' });
    expect(screen.getByRole('heading', { level: 1, name: "This page isn't for you" })).toBeTruthy();
    expect(screen.getByText(/nothing was changed/i)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Back to where you can go' }).getAttribute('href'),
    ).toBe('/venue');
  });

  it('403 offers no way back when nobody is signed in to have one', () => {
    renderState({ kind: 'forbidden' });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a session that ended is announced and signs in back to this very page', async () => {
    const user = userEvent.setup();
    renderState({ kind: 'signedOut' }, '/platform/venues/v-1?tab=staff');
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByTestId('sign-in').textContent).toBe('/platform/venues/v-1?tab=staff');
  });

  it('a server error carries its reference and a way Home', () => {
    renderState({ kind: 'error', reference: '7F3A-21C9', onRetry: () => {} });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Error code: 7F3A-21C9 · send it to the SHURJ team')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
  });

  it('a server error without a reference does not make one up', () => {
    renderState({ kind: 'error', onRetry: () => {} });
    expect(screen.queryByText(/error code/i)).toBeNull();
  });
});

describe('trying again', () => {
  it('says it is checking while the retry runs, then counts the attempt', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderState({ kind: 'offline', onRetry });
    expect(screen.getByRole('alert')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const busy = screen.getByRole('button', { name: 'Checking…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(onRetry).toHaveBeenCalledTimes(1);

    // A second press while one is in flight does not start another.
    await user.click(busy);
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(screen.getByRole('status').textContent).toMatch(/still not working · attempt 1/i);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('tries by itself when the browser comes back online', async () => {
    const onRetry = vi.fn(() => Promise.resolve());
    renderState({ kind: 'offline', onRetry });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it('promises no retry by itself after a server error: only a lost connection comes back alone', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn(() => Promise.resolve());
    renderState({ kind: 'error', onRetry });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const line = await screen.findByText(/still not working · attempt 1/i);
    expect(line.textContent).not.toMatch(/by ourselves|connection/i);
  });

  it('names what was not found: a page, or a branch, as well as a venue', () => {
    renderState({ kind: 'notFound', subject: 'page' }, '/platform/nothing-here');
    expect(screen.getByRole('heading', { level: 1, name: 'This page was not found' })).toBeTruthy();
    expect(screen.queryByText(/deleted.*filter/i)).toBeNull();
    cleanup();
    renderState({ kind: 'notFound', subject: 'branch' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'This branch was not found' }),
    ).toBeTruthy();
  });

  it('is not offered where it would do nothing', () => {
    renderState({ kind: 'notFound' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('which state a failure is', () => {
  it('maps every failure the client classifies', () => {
    expect(errorKindFor('offline')).toBe('offline');
    expect(errorKindFor('unauthorized')).toBe('signedOut');
    expect(errorKindFor('forbidden')).toBe('forbidden');
    expect(errorKindFor('notFound')).toBe('notFound');
    expect(errorKindFor('error')).toBe('error');
    expect(errorKindFor('conflict')).toBe('error');
    expect(errorKindFor(null)).toBe('error');
  });
});
