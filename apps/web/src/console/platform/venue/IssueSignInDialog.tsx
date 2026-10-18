import type { StaffMember, StaffSignInLink } from '@yalla/api';
import { useIssueStaffSignIn } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';
import { issueFailureText } from '../../venue/staff/signInIssue';
import { Required, usePendingFocus } from './venueFields';

/** The artboard's check: something, an @, something, a dot, something. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface IssueSignInDialogProps {
  readonly venueId: string;
  readonly member: Pick<StaffMember, 'id' | 'fullName' | 'email' | 'hasPasswordSignIn'>;
  /** The address to start from: theirs, or the one a refused hire tried. */
  readonly initialEmail: string;
  /** Why the last attempt was refused, under the field from the start. */
  readonly initialFailure?: string | null;
  readonly onClose: () => void;
  readonly onIssued: (link: StaffSignInLink) => void;
}

/**
 * A console sign-in for somebody already on the staff (VenueDetail artboard):
 * the address, what making the link changes for them, and the link shown
 * once afterwards (`OnceLinkDialog`).
 *
 * What changes is said under the field as it is typed, from the person's
 * state: a new address takes over the moment the link is made; somebody who
 * signs in already keeps their password until the link is opened; an earlier
 * unused link stops working.
 */
export function IssueSignInDialog({
  venueId,
  member,
  initialEmail,
  initialFailure = null,
  onClose,
  onIssued,
}: IssueSignInDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const issue = useIssueStaffSignIn(venueId);
  const focusLater = usePendingFocus();
  const [email, setEmail] = useState(initialEmail);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(initialFailure);

  const trimmed = email.trim();
  const invalid = !trimmed || !EMAIL_SHAPE.test(trimmed);
  const shownError = tried && invalid ? t('venuePage.issue.error') : failure;

  const old = member.email;
  const help =
    old && trimmed && trimmed.toLowerCase() !== old.toLowerCase() && !invalid
      ? t('venuePage.issue.helpChangesAddress', { email: trimmed, old })
      : member.hasPasswordSignIn
        ? t('venuePage.issue.helpKeepsPassword')
        : old
          ? t('venuePage.issue.helpReplacesLink')
          : t('venuePage.issue.helpNew');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (issue.isPending) return;
    setTried(true);
    if (invalid) {
      setFailure(null);
      focusLater('is-email');
      return;
    }
    setFailure(null);
    try {
      const link = await issue.mutateAsync({ staffMemberId: member.id, email: trimmed });
      onIssued(link);
    } catch (caught) {
      setFailure(
        issueFailureText(caught, {
          offline: t('state.offline'),
          generic: t('state.error'),
          badEmail: t('venuePage.issue.error'),
          tooManyRequests: t('staff.signIn.tooManyRequests'),
        }),
      );
      focusLater('is-email');
    } finally {
      // The hook keeps the answer as its own `data`: a second copy of the
      // link. The once dialog's copy is the only one wanted.
      issue.reset();
    }
  }

  const busy = issue.isPending;
  return (
    <Dialog
      title={t('venuePage.issue.title', { name: member.fullName })}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-fld">
          <label htmlFor="is-email">
            {t('venuePage.issue.email')}
            <Required />
          </label>
          <input
            id="is-email"
            className="yc-ctl"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            data-autofocus=""
            aria-required="true"
            aria-invalid={Boolean(shownError)}
            aria-describedby={`is-help${shownError ? ' is-err' : ''}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <span className="yc-help" id="is-help" aria-live="polite">
            {help}
          </span>
          {shownError ? (
            <span className="yc-err" id="is-err">
              {shownError}
            </span>
          ) : null}
        </div>
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={onClose} disabled={busy}>
            {t('venuePage.issue.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
            {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {busy ? t('venuePage.issue.sending') : t('venuePage.issue.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
