import { StaffPermissionError, StaffPinTakenError, describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';
import { ownPinProblem } from './staffActions';

export interface ChangeOwnPinDialogProps {
  /** Sets the PIN; rejects with whatever the gateway threw. */
  readonly onSubmit: (pin: string) => Promise<void>;
  /** The PIN is set: the caller closes this and says so. */
  readonly onChanged: () => void;
  readonly onClose: () => void;
}

/** Digits only, and never more than four: letters and a fifth digit never land. */
const digitsOnly = (value: string) => value.replace(/\D/gu, '').slice(0, 4);

/**
 * You, typing yourself a new PIN (Staff artboard, "Change my PIN").
 *
 * Unlike New PIN for somebody else, nothing is generated and nothing is shown:
 * you chose it, so there is nothing to read aloud. Both fields are masked, and
 * on success the dialog is gone before the toast says so, so the digits exist
 * on screen only as dots while being typed.
 */
export function ChangeOwnPinDialog({ onSubmit, onChanged, onClose }: ChangeOwnPinDialogProps) {
  const { t } = useTranslation(['admin', 'common']);

  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which field the error is about: the first for a taken or short PIN, else the second. */
  const [errorOn, setErrorOn] = useState<'pin' | 'again'>('again');

  function failureText(failure: unknown): string {
    // The server's own sentence when it refused; the house words otherwise.
    if (failure instanceof StaffPermissionError) return failure.message;
    if (failure instanceof StaffPinTakenError) return failure.message;
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

  function focus(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = ownPinProblem(pin, again);
    if (problem) {
      setError(problem === 'fourDigits' ? t('staff.pin.fourDigits') : t('staff.ownPin.mismatch'));
      setErrorOn(problem === 'fourDigits' ? 'pin' : 'again');
      focus(problem === 'fourDigits' ? 'op-a' : 'op-b');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(pin);
      setPin('');
      setAgain('');
      onChanged();
    } catch (failure) {
      setPending(false);
      setError(failureText(failure));
      // A PIN somebody on the same tablet uses: the new one is what to change.
      setErrorOn(failure instanceof StaffPinTakenError ? 'pin' : 'again');
      focus(failure instanceof StaffPinTakenError ? 'op-a' : 'op-b');
    }
  }

  const describedBy = (field: 'pin' | 'again') =>
    error && errorOn === field ? { 'aria-describedby': 'op-err', 'aria-invalid': true } : {};

  return (
    <Dialog
      title={t('staff.ownPin.title')}
      description={t('staff.ownPin.help')}
      onClose={pending ? () => undefined : onClose}
      dismissible={!pending}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-row2">
          <div className="yc-fld">
            <label htmlFor="op-a">{t('staff.ownPin.newPin')}</label>
            <input
              id="op-a"
              className="yc-ctl"
              data-autofocus=""
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pin}
              disabled={pending}
              {...describedBy('pin')}
              onChange={(event) => setPin(digitsOnly(event.currentTarget.value))}
            />
          </div>
          <div className="yc-fld">
            <label htmlFor="op-b">{t('staff.ownPin.again')}</label>
            <input
              id="op-b"
              className="yc-ctl"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={again}
              disabled={pending}
              {...describedBy('again')}
              onChange={(event) => setAgain(digitsOnly(event.currentTarget.value))}
            />
          </div>
        </div>
        {error ? (
          <span className="yc-err" id="op-err" role="alert">
            {error}
          </span>
        ) : null}
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" disabled={pending} onClick={onClose}>
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={pending}>
            {pending ? <span className="yc-spin" aria-hidden="true" /> : null}
            {pending ? t('saving') : t('staff.ownPin.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
