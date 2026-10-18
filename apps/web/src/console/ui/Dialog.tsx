import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../components/useDialogFocus';

export interface DialogProps {
  readonly title: ReactNode;
  /** The sentence under the title, read out as the dialog's description. */
  readonly description?: ReactNode;
  /**
   * The id of an element in `children` that describes the dialog instead,
   * for a description that is not a plain sentence under the title (a refusal
   * box, say). Wins over `description` for `aria-describedby`.
   */
  readonly describedBy?: string;
  /** Escape, a press on the scrim, and whatever close button the body has. */
  readonly onClose: () => void;
  /**
   * False for the dialogs that must not be dismissed by accident: a sign-in
   * link or a PIN shown once, which is gone for good once the dialog closes.
   * Escape and the scrim then do nothing; only the dialog's own buttons close it.
   */
  readonly dismissible?: boolean;
  /** 560px rather than 460px, for a dialog with a form or a step list in it. */
  readonly wide?: boolean;
  /**
   * An `alertdialog`: a confirm or a refusal that interrupts, rather than a
   * form the person opened to fill in (WAI-ARIA's distinction). Screen
   * readers read its description out on open.
   */
  readonly alert?: boolean;
  /** Where the focus goes on close, when the opener is gone (a menu item). */
  readonly returnFocusTo?: () => HTMLElement | null;
  readonly children: ReactNode;
}

/**
 * The console's modal dialog (HANDOFF section 4).
 *
 * Focus goes in — to the control marked `data-autofocus`, or the first one —
 * Tab and Shift+Tab stay inside, Escape closes, and the focus goes back to the
 * opener (or `returnFocusTo`) on close. Portalled to `<body>` so no card's
 * overflow or stacking can clip it.
 */
export function Dialog({
  title,
  description,
  describedBy,
  onClose,
  dismissible = true,
  wide = false,
  alert = false,
  returnFocusTo,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus(ref, {
    onEscape: onClose,
    escapeEnabled: dismissible,
    ...(returnFocusTo ? { returnFocusTo } : {}),
  });

  return createPortal(
    <div
      className="yc yc-overlay"
      data-testid="dialog-scrim"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={wide ? 'yc-dialog yc-dialog-wide' : 'yc-dialog'}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedBy
          ? { 'aria-describedby': describedBy }
          : description
            ? { 'aria-describedby': descriptionId }
            : {})}
      >
        <h2 className="yc-h2" id={titleId}>
          {title}
        </h2>
        {description ? <p id={descriptionId}>{description}</p> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
