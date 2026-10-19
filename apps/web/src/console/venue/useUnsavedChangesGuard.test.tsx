// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';
import {
  UnsavedChangesHost,
  hasUnsavedChanges,
  useUnsavedChangesGuard,
} from './useUnsavedChangesGuard';

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
        <UnsavedChangesHost />
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
  it("asks in the console's own dialog before a link leaves unsaved work, and stays when told to", async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    open(true);

    await user.click(screen.getByRole('link', { name: 'Menu' }));

    const ask = screen.getByRole('alertdialog', { name: 'Leave without saving?' });
    expect(ask.textContent).toContain('You have unsaved changes. Leave without saving them?');
    await user.click(within(ask).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Editing the hours')).toBeTruthy();
    expect(screen.queryByText('The menu')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('leaves when the person says so', async () => {
    const user = userEvent.setup();
    open(true);

    await user.click(screen.getByRole('link', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));

    expect(screen.getByText('The menu')).toBeTruthy();
  });

  it('asks nothing when nothing is unsaved', async () => {
    const user = userEvent.setup();
    open(false);

    expect(hasUnsavedChanges()).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Menu' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('The menu')).toBeTruthy();
  });

  it('tells the branch switcher there is unsaved work', () => {
    open(true);
    expect(hasUnsavedChanges()).toBe(true);
  });
});
