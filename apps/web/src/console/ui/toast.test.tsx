// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../venue/reports/testHarness';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { TOAST_MS, TOAST_UNDO_MS, ToastProvider, useToast, type ToastOptions } from './toast';

/**
 * The console's toast: one at a time, announced, and undoable.
 *
 * The artboards' rule (`Venues.dc.html`, `say()`): a toast replaces the one
 * before it, goes away by itself after 3.5s, or after 7s when it carries an
 * undo, and pressing Undo runs the undo and removes the toast. Every
 * destructive or suspending action in the redesign leans on this.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  // `shouldAdvanceTime`: user-event and React's act await real ticks too.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ message, options }: { message: string; options?: ToastOptions }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.say(message, options)}>
      {`say ${message}`}
    </button>
  );
}

function renderWith(children: React.ReactNode) {
  render(
    <I18nextProvider i18n={i18next}>
      <ToastProvider>{children}</ToastProvider>
    </I18nextProvider>,
  );
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('a toast', () => {
  it('is said in a live region that exists before anything is said', async () => {
    const user = renderWith(<Trigger message="Saved" />);
    // A region inserted together with its text is not reliably announced.
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'say Saved' }));
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });

  it('goes away by itself after 3.5 seconds', async () => {
    const user = renderWith(<Trigger message="Saved" />);
    await user.click(screen.getByRole('button', { name: 'say Saved' }));

    act(() => vi.advanceTimersByTime(TOAST_MS - 100));
    expect(screen.getByRole('status').textContent).toContain('Saved');
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('status').textContent).toBe('');
    expect(TOAST_MS).toBe(3500);
  });

  it('replaces the one before it rather than stacking', async () => {
    const user = renderWith(
      <>
        <Trigger message="First" />
        <Trigger message="Second" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'say First' }));
    await user.click(screen.getByRole('button', { name: 'say Second' }));

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('Second');
    expect(text).not.toContain('First');
  });
});

describe('a toast with an undo', () => {
  it('stays for 7 seconds, and Undo runs the undo and removes the toast', async () => {
    const undo = vi.fn();
    const user = renderWith(<Trigger message="Deleted" options={{ undo }} />);
    await user.click(screen.getByRole('button', { name: 'say Deleted' }));

    act(() => vi.advanceTimersByTime(TOAST_MS + 500));
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(TOAST_UNDO_MS).toBe(7000);

    await user.click(button);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('can take the focus, so a keyboard user reaches Undo at once', async () => {
    const user = renderWith(
      <Trigger message="Deleted" options={{ undo: () => {}, focusUndo: true }} />,
    );
    await user.click(screen.getByRole('button', { name: 'say Deleted' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
  });

  it('waits while it has the focus, and gives the focus back when it goes', async () => {
    const user = renderWith(
      <Trigger message="Deleted" options={{ undo: () => {}, focusUndo: true }} />,
    );
    const opener = screen.getByRole('button', { name: 'say Deleted' });
    await user.click(opener);

    // Focus is inside: the clock does not run out on somebody reading it.
    act(() => vi.advanceTimersByTime(TOAST_UNDO_MS + 1000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();

    // Focus leaves; the full time starts again, then it goes.
    await user.click(document.body);
    act(() => vi.advanceTimersByTime(TOAST_UNDO_MS + 100));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('hands the focus back to where it was when Undo removes it', async () => {
    const user = renderWith(
      <Trigger message="Deleted" options={{ undo: () => {}, focusUndo: true }} />,
    );
    const opener = screen.getByRole('button', { name: 'say Deleted' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.activeElement).toBe(opener);
  });
});
