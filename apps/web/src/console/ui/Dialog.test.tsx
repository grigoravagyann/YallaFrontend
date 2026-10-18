// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/**
 * The console's modal dialog, per HANDOFF section 4: Escape closes, focus goes
 * in, Tab is trapped, and focus returns to the opener. The once-shown link
 * dialog is the exception that cannot be dismissed by Escape or the scrim.
 */

afterEach(cleanup);

function Harness({
  dismissible = true,
  autofocusSecond = false,
}: {
  readonly dismissible?: boolean;
  readonly autofocusSecond?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {open ? (
        <Dialog
          title="Suspend Cascade Cafe?"
          description="Guests stop seeing it."
          onClose={() => setOpen(false)}
          dismissible={dismissible}
        >
          <input aria-label="Reason" />
          <div>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" {...(autofocusSecond ? { 'data-autofocus': '' } : {})}>
              Suspend
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

describe('a dialog', () => {
  it('is a labelled, described modal', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Suspend Cascade Cafe?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Guests stop seeing it.',
    );
  });

  it('takes the focus on open: the marked control, or else the first one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
    cleanup();

    render(<Harness autofocusSecond />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Suspend' }));
  });

  it('keeps Tab and Shift+Tab inside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Suspend' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Suspend' }));
  });

  it('closes on Escape and gives the focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a press on the scrim, but not on one inside it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByLabelText('Reason'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    await user.click(screen.getByTestId('dialog-scrim'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays put when it may not be dismissed: no Escape, no scrim', async () => {
    const user = userEvent.setup();
    render(<Harness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('dialog-scrim'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('returns the focus to a named element when the opener is gone', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Gone() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" id="kebab">
            More
          </button>
          {open ? (
            <Dialog
              title="Delete?"
              onClose={() => {
                onClose();
                setOpen(false);
              }}
              returnFocusTo={() => document.getElementById('kebab')}
            >
              <button type="button">Delete</button>
            </Dialog>
          ) : null}
        </>
      );
    }
    render(<Gone />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }));
  });
});
