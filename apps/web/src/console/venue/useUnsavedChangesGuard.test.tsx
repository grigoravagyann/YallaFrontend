// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';
import { confirmLeave, useUnsavedChangesGuard } from './useUnsavedChangesGuard';

/**
 * QA 2026-10-16 (C-M2): a link inside the app threw unsaved rooms away with no
 * question, because the guard only listened to `beforeunload`. The hours,
 * policy and public page screens share the hook, so they had the same hole.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Editing({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  return <p>Editing the hours</p>;
}

function open(dirty: boolean) {
  const harness = createConsoleHarness();
  render(
    harness.wrap(
      <>
        <Link to="/venue/menu">Menu</Link>
        <Routes>
          <Route path="/venue/hours" element={<Editing dirty={dirty} />} />
          <Route path="/venue/menu" element={<p>The menu</p>} />
        </Routes>
      </>,
      '/venue/hours',
    ),
  );
}

describe('the unsaved changes guard', () => {
  it('asks before a link inside the app leaves unsaved work, and stays when told to', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    open(true);

    await user.click(screen.getByRole('link', { name: 'Menu' }));

    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving them?');
    expect(screen.getByText('Editing the hours')).toBeTruthy();
    expect(screen.queryByText('The menu')).toBeNull();
  });

  it('leaves when the person says so', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    open(true);

    await user.click(screen.getByRole('link', { name: 'Menu' }));

    expect(screen.getByText('The menu')).toBeTruthy();
  });

  it('asks nothing when nothing is unsaved', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    open(false);

    expect(confirmLeave()).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Menu' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('The menu')).toBeTruthy();
  });

  it('answers the branch switcher with the same question', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open(true);

    expect(confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
