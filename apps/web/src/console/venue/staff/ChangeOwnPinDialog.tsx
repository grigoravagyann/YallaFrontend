import { StaffPermissionError, describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { ownPinProblem } from './staffActions';

export interface ChangeOwnPinDialogProps {
  /** Sets the PIN; rejects with whatever the gateway threw. */
  readonly onSubmit: (pin: string) => Promise<void>;
  readonly onClose: () => void;
}

/** Digits only, and never more than four: letters and a fifth digit never land. */
const digitsOnly = (value: string) => value.replace(/\D/gu, '').slice(0, 4);

/**
 * You, typing yourself a new PIN — the one change your own card offers.
 *
 * Unlike New PIN for somebody else, nothing is generated and nothing is shown:
 * you chose it, so there is nothing to read aloud. Both fields are masked, and
 * on success they are emptied and unmounted before the confirmation appears,
 * so the digits exist on screen only as dots while being typed.
 */
export function ChangeOwnPinDialog({ onSubmit, onClose }: ChangeOwnPinDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [phase, setPhase] = useState<'form' | 'pending' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const pending = phase === 'pending';

  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(dialogRef, { onEscape: close, escapeEnabled: !pending });

  // The form, and the button that had focus, are gone: focus the dismiss.
  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus();
  }, [phase]);

  function failureText(failure: unknown): string {
    // The server's own sentence when it refused; the house words otherwise.
    if (failure instanceof StaffPermissionError) return failure.message;
    switch (describeFailure(failure)) {
      case 'offline':
        return t('state.offline');
      case 'invalid':
        return t('staff.pin.fourDigits');
      case 'forbidden':
        return t('state.forbidden');
      case 'unauthorized':
        return t('state.signedOut');
      default:
        return t('state.error');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = ownPinProblem(pin, again);
    if (problem) {
      setError(problem === 'fourDigits' ? t('staff.pin.fourDigits') : t('staff.ownPin.mismatch'));
      return;
    }
    setError(null);
    setPhase('pending');
    try {
      await onSubmit(pin);
      setPin('');
      setAgain('');
      setPhase('done');
    } catch (failure) {
      setError(failureText(failure));
      setPhase('form');
    }
  }

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="card wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wizard-head">
          <h2 id={titleId}>{t('staff.ownPin.title')}</h2>
        </header>

        {phase === 'done' ? (
          <>
            <div className="wizard-body" role="status">
              <p>
                <strong>{t('staff.ownPin.changed')}</strong>
              </p>
              <p className="muted small">{t('staff.ownPin.changedBody')}</p>
            </div>
            <footer className="wizard-foot">
              <button
                ref={doneRef}
                type="button"
                className="button button-primary"
                onClick={onClose}
              >
                {t('staff.ownPin.done')}
              </button>
            </footer>
          </>
        ) : (
          <form
            className="wizard-form"
            aria-labelledby={titleId}
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <div className="wizard-body">
              <p className="muted small">{t('staff.ownPin.help')}</p>
              <label className="labelled">
                <span>{t('staff.ownPin.newPin')}</span>
                <input
                  className="field"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  value={pin}
                  disabled={pending}
                  onChange={(event) => setPin(digitsOnly(event.currentTarget.value))}
                />
              </label>
              <label className="labelled">
                <span>{t('staff.ownPin.again')}</span>
                <input
                  className="field"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  value={again}
                  disabled={pending}
                  onChange={(event) => setAgain(digitsOnly(event.currentTarget.value))}
                />
              </label>
              {error ? (
                <p className="field-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="wizard-foot">
              <button
                type="button"
                className="button button-ghost"
                disabled={pending}
                onClick={onClose}
              >
                {t('common:action.cancel')}
              </button>
              <button type="submit" className="button button-primary" disabled={pending}>
                {pending ? t('saving') : t('staff.ownPin.submit')}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
