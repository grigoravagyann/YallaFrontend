import type { StaffMember } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import { EMAIL_SHAPE } from './StaffForm';

export interface SignInPromptProps {
  readonly member: StaffMember;
  /** Their current address, or the one a failed hire tried. */
  readonly initialEmail: string;
  /** The server's sentence from the last attempt, under the field. */
  readonly failure: string | null;
  readonly isPending: boolean;
  readonly onSend: (email: string) => void;
  readonly onCancel: () => void;
}

/**
 * The address a sign-in link goes out for, asked inline on the person's row.
 *
 * Two facts about the server shape this:
 *
 * - **Issuing again retires the earlier link.** Somebody who lost the first
 *   one gets a working second; somebody who still has the first finds it dead.
 *   The help text says so whenever there is a previous link to retire.
 * - **The address changes the moment the server answers**, while the password
 *   changes only when the link is used. For somebody who already signs in,
 *   a different address here re-points a *working* sign-in before they have
 *   done anything — a typo locks them out with no notice. So a changed address
 *   is stated back and needs a second click; the same address, the usual
 *   "send me a fresh one", goes straight through.
 */
export function SignInPrompt({
  member,
  initialEmail,
  failure,
  isPending,
  onSend,
  onCancel,
}: SignInPromptProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const address = email.trim();
  // Compared lowercased because that is how the server stores it: a change of
  // case alone is not a change of address and should not be read back as one.
  const changesAddress =
    member.hasPasswordSignIn &&
    member.email !== null &&
    address.toLocaleLowerCase() !== member.email.toLocaleLowerCase();

  const fieldId = `sign-in-email-${member.id}`;
  const shown = error ?? failure;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!EMAIL_SHAPE.test(address)) {
      setError(t('staff.signIn.emailRequired'));
      return;
    }
    if (changesAddress && !armed) {
      setArmed(true);
      return;
    }
    onSend(address);
  }

  return (
    <form
      className="sign-in-prompt"
      aria-label={t('staff.signIn.dialogTitle', { name: member.fullName })}
      onSubmit={submit}
    >
      <div className="labelled">
        <label htmlFor={fieldId}>{t('staff.field.email')}</label>
        <input
          id={fieldId}
          className="field"
          // As on the hire form: the shape is checked with the app's own
          // sentence, and the browser only enforces "not empty".
          type="text"
          inputMode="email"
          value={email}
          required
          autoComplete="email"
          {...(shown ? { 'aria-describedby': `${fieldId}-error` } : {})}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            // A new address is a new question.
            setArmed(false);
          }}
        />
        {member.email ? (
          <span className="muted small">{t('staff.signIn.previousStops')}</span>
        ) : null}
        {shown ? (
          <span id={`${fieldId}-error`} className="field-error" role="alert">
            {shown}
          </span>
        ) : null}
      </div>

      {armed && changesAddress ? (
        <p className="pin-warning">{t('staff.signIn.addressChanges', { email: address })}</p>
      ) : null}

      <div className="actions">
        <button type="submit" className="button button-small button-primary" disabled={isPending}>
          {isPending
            ? t('saving')
            : armed && changesAddress
              ? t('staff.signIn.confirmSend')
              : t('staff.signIn.send')}
        </button>
        <button type="button" className="button button-small button-ghost" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </form>
  );
}
