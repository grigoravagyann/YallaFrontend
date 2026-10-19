import { SignInUnknownError, StaffPinTakenError, type VenueSession } from '@yalla/api';
import {
  useChangeVenuePassword,
  useSetStaffPin,
  useSignOutOtherVenueSessions,
  useUpdateVenueProfile,
  useVenueProfile,
  useVenueSessions,
} from '@yalla/api/react';
import { formatDayAndTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useRef, useState, type FormEvent } from 'react';
import { signOut } from '../../../auth/authSession';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { usingMockData } from '../../../data/gateway';
import { useManagedVenue } from '../../../data/queries';
import { usePendingFocus } from '../../platform/venue/venueFields';
import { LanguageCard, PasswordCard, ProfileCard } from '../../ui/AccountCards';
import { Dialog } from '../../ui/Dialog';
import { MonitorIcon, SignOutIcon } from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { useVenueOutlet } from '../VenueLayout';
import { describeBrowser } from './describeBrowser';

/**
 * My account (venue-console Account artboard), opened from the person at the
 * sidebar's foot: the name and the console password (each saved on its own,
 * with the platform admin's Settings cards), their own tablet PIN, the
 * console's language, where they are signed in, and signing out.
 *
 * For an owner, a general manager or a branch manager — the roles under
 * `/venue`; the server's `/api/venue/me` admits exactly those.
 */
export function AccountScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useCurrentUser();
  const venue = useManagedVenue(user?.scope.venueId ?? undefined);
  const profile = useVenueProfile();
  const rename = useUpdateVenueProfile();
  const change = useChangeVenuePassword();
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;
  const role = t(`role.${user.role}`);

  return (
    <div className="yc-account">
      <PageHeader
        title={t('account.title')}
        sub={venue.data ? t('account.sub', { role, venue: venue.data.name }) : role}
        actions={
          // Only against a real backend: the mock has no session to end, and a
          // sign-out that does nothing is worse than none.
          usingMockData ? null : (
            <button type="button" className="yc-btn yc-btn-sec" onClick={() => setLeaving(true)}>
              <SignOutIcon />
              {t('shell.signOut')}
            </button>
          )
        }
      />

      <div className="yc-acc-grid">
        <div className="yc-acc-col">
          <ProfileCard
            query={profile}
            save={rename}
            cap={
              user.role === 'owner'
                ? t('account.profile.emailByTeam')
                : t('account.profile.emailByOwner')
            }
          />
          <PasswordCard change={change} title={t('account.password.title')} />
        </div>
        <div className="yc-acc-col">
          {user.scope.venueId ? (
            <PinCard venueId={user.scope.venueId} staffMemberId={user.id} />
          ) : null}
          <LanguageCard />
          <SessionsCard />
        </div>
      </div>

      {leaving ? (
        <Dialog
          alert
          title={t('account.signOutDialog.title')}
          description={t('account.signOutDialog.body')}
          onClose={() => setLeaving(false)}
        >
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              onClick={() => setLeaving(false)}
            >
              {t('account.signOutDialog.stay')}
            </button>
            <button type="button" className="yc-btn yc-btn-danger" onClick={() => void signOut()}>
              {t('account.signOutDialog.confirm')}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

const PIN_PATTERN = /^\d{4}$/u;
const digitsOnly = (value: string) => value.replace(/\D/gu, '').slice(0, 4);

/**
 * Their own tablet PIN, typed twice, through the staff route every PIN goes
 * through (`POST /api/venues/{id}/staff/{own id}/pin`), which lets anybody
 * set their own. Shown nowhere, and forgotten once sent: the fields clear.
 */
function PinCard({ venueId, staffMemberId }: { venueId: string; staffMemberId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const setPin = useSetStaffPin(venueId);
  const toast = useToast();
  const focusLater = usePendingFocus();
  const titleId = useId();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [tried, setTried] = useState(false);
  const [taken, setTaken] = useState(false);
  const [failed, setFailed] = useState(false);

  // The artboard's one rule at a time: four digits first, then the same twice.
  const problem: { field: 'pin-a' | 'pin-b'; text: string } | null = !PIN_PATTERN.test(first)
    ? { field: 'pin-a', text: t('account.pin.format') }
    : first !== second
      ? { field: 'pin-b', text: t('account.pin.mismatch') }
      : null;
  const shown = taken
    ? { field: 'pin-a' as const, text: t('account.pin.taken') }
    : tried
      ? problem
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (setPin.isPending) return;
    setTried(true);
    setTaken(false);
    setFailed(false);
    if (problem) {
      focusLater(problem.field);
      return;
    }
    try {
      await setPin.mutateAsync({ staffMemberId, pin: first });
      setFirst('');
      setSecond('');
      setTried(false);
      toast.say(t('account.pin.changed'));
    } catch (caught) {
      if (caught instanceof StaffPinTakenError) {
        setTaken(true);
        focusLater('pin-a');
      } else {
        setFailed(true);
      }
    }
  }

  const invalid = (field: 'pin-a' | 'pin-b') =>
    shown?.field === field ? { 'aria-invalid': true as const, 'aria-describedby': 'pin-err' } : {};

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('account.pin.title')}
          </h2>
          <p className="yc-cap">{t('account.pin.cap')}</p>
        </div>
      </div>
      <form className="yc-sform" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-row2 yc-pins">
          <div className="yc-fld">
            <label htmlFor="pin-a">{t('account.pin.new')}</label>
            <input
              id="pin-a"
              type="password"
              className="yc-ctl"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={first}
              {...invalid('pin-a')}
              onChange={(event) => {
                setFirst(digitsOnly(event.target.value));
                setTaken(false);
              }}
            />
          </div>
          <div className="yc-fld">
            <label htmlFor="pin-b">{t('account.pin.repeat')}</label>
            <input
              id="pin-b"
              type="password"
              className="yc-ctl"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={second}
              {...invalid('pin-b')}
              onChange={(event) => setSecond(digitsOnly(event.target.value))}
            />
          </div>
        </div>
        {shown ? (
          <span className="yc-err" id="pin-err">
            {shown.text}
          </span>
        ) : null}
        {failed ? (
          <p className="yc-alert" role="alert">
            {t('account.pin.failed')}
          </p>
        ) : null}
        <div className="yc-sform-foot">
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={setPin.isPending}>
            {setPin.isPending ? t('account.pin.changing') : t('account.pin.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * The sign-ins that can still renew: this one first, then the others. The
 * server records no device or place for any of them, so only this browser —
 * the one the console is running in — is described; the others are "another
 * sign-in" with when it started and when it was last used.
 */
function SessionsCard() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { timeZoneId } = useVenueOutlet();
  const sessions = useVenueSessions();
  const signOutOthers = useSignOutOtherVenueSessions();
  const toast = useToast();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** `unknown`: a sign-in the server cannot name (409 `sign-in-unknown`); nothing was ended. */
  const [failed, setFailed] = useState<'unknown' | 'other' | null>(null);

  const rows = sessions.data ?? [];
  const hasOthers = rows.some((session) => !session.isCurrent);
  const here = describeBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  const when = (atUtc: string) => {
    const at = formatDayAndTime(atUtc, timeZoneId, locale);
    return at.day === 'today'
      ? t('account.sessions.today', { time: at.time })
      : t('account.sessions.onDay', { date: at.date, time: at.time });
  };
  const line = (session: VenueSession) =>
    session.isCurrent
      ? t('account.sessions.activeNow', { signedIn: when(session.signedInAtUtc) })
      : t('account.sessions.lastActive', {
          signedIn: when(session.signedInAtUtc),
          lastActive: when(session.lastActiveAtUtc),
        });

  async function endOthers() {
    if (signOutOthers.isPending) return;
    setFailed(null);
    try {
      const { endedSessions } = await signOutOthers.mutateAsync();
      // The button leaves with the others; the focus goes to the card, not <body>.
      titleRef.current?.focus();
      toast.say(
        endedSessions > 0
          ? t('account.sessions.ended', { count: endedSessions })
          : t('account.sessions.endedNone'),
      );
    } catch (caught) {
      setFailed(caught instanceof SignInUnknownError ? 'unknown' : 'other');
    }
  }

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId} ref={titleRef} tabIndex={-1}>
            {t('account.sessions.title')}
          </h2>
          <p className="yc-cap">{t('account.sessions.cap')}</p>
        </div>
        {hasOthers ? (
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            aria-busy={signOutOthers.isPending}
            onClick={() => void endOthers()}
          >
            {signOutOthers.isPending
              ? t('account.sessions.signingOut')
              : t('account.sessions.signOutOthers')}
          </button>
        ) : null}
      </div>
      {failed === 'unknown' ? (
        // Only a new sign-in names itself to the server; retrying here would
        // be refused the same way.
        <div className="yc-sform-note yc-signin-again">
          <p className="yc-alert" role="alert">
            {t('account.sessions.signInUnknown')}
          </p>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => void signOut()}
          >
            {t('account.sessions.signInAgain')}
          </button>
        </div>
      ) : failed === 'other' ? (
        <p className="yc-alert yc-sform-note" role="alert">
          {t('account.sessions.failed')}
        </p>
      ) : null}
      {sessions.isError && !sessions.data ? (
        <p className="yc-alert yc-sform-note" role="alert">
          {t('account.sessions.loadFailed')}
        </p>
      ) : sessions.data ? (
        <ul className="yc-sess">
          {rows.map((session) => (
            <li key={session.id}>
              <span className="yc-sess-ic" aria-hidden="true">
                <MonitorIcon />
              </span>
              <span className="yc-sess-t">
                <b>
                  {session.isCurrent
                    ? (here ?? t('account.sessions.thisBrowser'))
                    : t('account.sessions.other')}
                </b>
                <small>{line(session)}</small>
              </span>
              {session.isCurrent ? (
                <span className="yc-pill yc-pill-green">{t('account.sessions.thisDevice')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}
