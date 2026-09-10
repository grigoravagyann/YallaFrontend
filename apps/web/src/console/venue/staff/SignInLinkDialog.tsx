import type { StaffSignInLink } from '@yalla/api';
import { formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';

export interface SignInLinkDialogProps {
  readonly name: string;
  /**
   * Right after a hire, the PIN from the form, shown once beside the link.
   * Absent when the link was issued from a row.
   */
  readonly pin: string | null;
  /** The one copy. `null` when the issue failed and `failure` says why. */
  readonly link: StaffSignInLink | null;
  /** The server's sentence when the person exists but no link was issued. */
  readonly failure: string | null;
  readonly timeZoneId: string;
  readonly locale: Locale;
  /** Offered with `failure`: closes this and opens the row's email prompt. */
  readonly onRetry: (() => void) | null;
  readonly onClose: () => void;
}

/**
 * A sign-in link, shown once, and the PIN beside it when both were just made.
 *
 * ## Why once
 *
 * The same promise {@link PinDialog} makes. The server keeps the token's hash
 * and no read ever returns the link, so this dialog is the single place it
 * exists — held in the screen's `useState`, never in a query cache, never in
 * storage, never in a URL of our own, never logged, and gone from the document
 * when this closes. A lost link is replaced by issuing another, which retires
 * this one.
 *
 * ## Why there is a copy button here and not on the PIN
 *
 * A PIN is read aloud across a counter and typed into a tablet; there is
 * nowhere legitimate for it to be pasted, so a copy button only puts it on
 * the clipboard for the next paste to reveal. A link exists *to be pasted*:
 * the whole delivery is "into a chat, on a phone", and asking somebody to
 * select a hundred characters by hand on a touch screen is how it gets sent
 * with a character missing. The clipboard is outside this app's control, and
 * that is accepted with open eyes: the token dies on first use or at expiry,
 * and the person copying it is the person who was just trusted to issue it.
 *
 * Where the clipboard is out of reach — an insecure origin, a browser that
 * refuses — the block is selected instead and the text says to copy it.
 *
 * ## After a hire that half-succeeded
 *
 * The person exists, so their PIN must be shown now or it is lost; the link
 * section then carries the server's sentence and a way to try again from the
 * row, where the address can be corrected.
 */
export function SignInLinkDialog({
  name,
  pin,
  link,
  failure,
  timeZoneId,
  locale,
  onRetry,
  onClose,
}: SignInLinkDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const copyRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'select'>('idle');
  const [escaped, setEscaped] = useState(false);

  // Copy takes focus when there is a link, and is the one filled button:
  // Enter and the mouse then both do the one thing this dialog is for, rather
  // than closing it on the only copy. Otherwise the dismiss is primary and
  // focused, as the PIN dialog does, so Escape and Enter are both safe.
  useEffect(() => {
    (link ? copyRef.current : closeRef.current)?.focus();
  }, [link]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Not while the only copy is uncopied: one keypress must not discard a
      // credential the server cannot reproduce. Say what to do instead; Done
      // is still one click away for somebody who means it.
      if (link && copied === 'idle') {
        setEscaped(true);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, link, copied]);

  const when = (iso: string) =>
    `${formatDate(iso, timeZoneId, locale)} ${formatTime(iso, timeZoneId, locale)}`;

  // Beside the copy button: what the copy did, or what Escape wants first.
  const copyStatus =
    copied === 'copied'
      ? t('staff.signIn.copied')
      : copied === 'select'
        ? t('staff.signIn.selectAndCopy')
        : escaped
          ? t('staff.signIn.copyFirst')
          : null;

  function selectLink() {
    const node = linkRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.resetLink);
      setCopied('copied');
    } catch {
      // Blocked, or no clipboard at all. The link is on screen; select it so
      // the copy is one keystroke away and say so.
      selectLink();
      setCopied('select');
    }
  }

  return (
    <div className="scrim" role="presentation">
      <div
        className="card pin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-link-title"
      >
        <h3 id="sign-in-link-title">{t('staff.signIn.dialogTitle', { name })}</h3>

        {pin ? (
          <>
            <p className="muted small">{t('staff.signIn.pinLabel')}</p>
            {/* Spelled out for a screen reader, as the PIN dialog does. */}
            <p className="pin-value" aria-label={pin.split('').join(' ')}>
              {pin}
            </p>
            <p className="pin-warning">{t('staff.pin.shownOnceBody')}</p>
          </>
        ) : null}

        {link ? (
          <>
            <p className="muted small">
              {t('staff.signIn.linkLabel')} · {link.email}
            </p>
            <p>{t('staff.signIn.linkBody')}</p>
            <p ref={linkRef} className="sign-in-link-value">
              {link.resetLink}
            </p>
            <div className="actions">
              <button
                ref={copyRef}
                type="button"
                className="button button-primary"
                onClick={() => void copy()}
              >
                {t('staff.signIn.copy')}
              </button>
              {copyStatus ? (
                <span className="muted small" role="status">
                  {copyStatus}
                </span>
              ) : null}
            </div>
            <p className="pin-warning">
              {t('staff.signIn.expires', { when: when(link.expiresAtUtc) })}
            </p>
            <p className="muted small">{t('staff.signIn.onceOnly')}</p>
            {link.replacedExistingSignIn ? (
              <p className="muted small">{t('staff.signIn.keepsPassword')}</p>
            ) : null}
          </>
        ) : failure ? (
          <>
            <p className="field-error" role="alert">
              {t('staff.signIn.notIssued')} {failure}
            </p>
            {onRetry ? (
              <div className="actions">
                <button type="button" className="button" onClick={onRetry}>
                  {t('common:action.retry')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="actions">
          <button
            ref={closeRef}
            type="button"
            className={link ? 'button button-ghost' : 'button button-primary'}
            onClick={onClose}
          >
            {t('staff.signIn.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
