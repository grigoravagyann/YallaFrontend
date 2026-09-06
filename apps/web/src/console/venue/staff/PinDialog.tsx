import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef } from 'react';

export interface PinDialogProps {
  readonly name: string;
  /** Shown once and then gone. Never read back from anywhere. */
  readonly pin: string;
  readonly onClose: () => void;
}

/**
 * A PIN, shown once, on a screen built to be read aloud across a counter.
 *
 * ## Why once
 *
 * A PIN that can be looked up later is a PIN that gets written on the till. The
 * server stores only a hash and no read returns it, so this is the single
 * moment it exists on a screen — and when this dialog closes the value is gone
 * from the app entirely. It is never put in a query cache, never in
 * `localStorage` or `sessionStorage`, never in a URL, never logged, and never
 * in a toast that outlives the moment somebody was looking at it.
 *
 * ## Why it is large
 *
 * It is dictated. A manager reads it to a waiter standing on the other side of
 * a counter in a room with music on, and the digits are grouped because a
 * four-digit string read as "two-nine-four-one" is repeated back correctly and
 * one read as "twenty-nine forty-one" is not.
 *
 * ## What is deliberately absent
 *
 * A copy button. Copying puts the credential on the system clipboard, where the
 * next paste in any application reveals it, and there is nowhere legitimate for
 * it to be pasted — the person who needs it is going to type it into a tablet.
 */
export function PinDialog({ name, pin, onClose }: PinDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the dismiss, so Escape and Enter both do the safe thing and the
  // dialog cannot be left open behind another screen.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" role="presentation">
      <div className="card pin-dialog" role="dialog" aria-modal="true" aria-labelledby="pin-title">
        <h3 id="pin-title">{t('staff.pin.shownOnceTitle', { name })}</h3>

        {/* `aria-label` spells the digits out, because a screen reader reading
            "2941" as "two thousand nine hundred and forty-one" is unusable for
            the one thing this screen is for. */}
        <p className="pin-value" aria-label={pin.split('').join(' ')}>
          {pin}
        </p>

        <p className="pin-warning">{t('staff.pin.shownOnceBody')}</p>
        <p className="muted small">{t('staff.pin.neverShared')}</p>

        <div className="actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            {t('staff.pin.written')}
          </button>
        </div>
      </div>
    </div>
  );
}
