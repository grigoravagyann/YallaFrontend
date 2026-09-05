import { EnrolmentCodeSpentError, describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import { staffSession } from './staffSession';

/**
 * Enrolling a browser as a tablet. Once, during onboarding.
 *
 * A manager generates a code in the console and reads it out; somebody types it
 * here and names the device. From then on this browser has a credential and
 * never sees this screen again unless it is revoked.
 *
 * Two things it deliberately does not have:
 *
 * - **No email field, and no link to one.** This is the screen a waiter might
 *   see if they open the app before a manager has enrolled the tablet, and the
 *   whole staff model is that they never type an address. A sign-in form here
 *   would be the shortest path to a shared owner account on the counter.
 * - **No retry loop on a spent code.** A code works exactly once. Offering
 *   "try again" would have somebody retype the same eight characters four
 *   times; the answer is a new code, so that is what it says.
 */
export interface EnrolDeviceScreenProps {
  /** Why the tablet is here, when it has been here before. */
  readonly reason: 'never' | 'revoked';
}

/** A sensible name for a browser, so the field is never blank on submit. */
function defaultDeviceName(): string {
  return typeof navigator === 'undefined' ? 'Counter' : `Counter · ${navigator.platform || 'web'}`;
}

export function EnrolDeviceScreen({ reason }: EnrolDeviceScreenProps) {
  const { t } = useTranslation(['staff', 'common']);
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!staffSession) return;
    setBusy(true);
    setFailure(null);
    try {
      // No callback: enrolling moves the session to `locked`, and the gate
      // above renders the keypad from that. One source of truth.
      await staffSession.enrol({
        code: code.trim(),
        deviceName: deviceName.trim() || defaultDeviceName(),
      });
    } catch (error) {
      if (error instanceof EnrolmentCodeSpentError) {
        setFailure(t('enrol.codeSpent'));
      } else {
        const kind = describeFailure(error);
        setFailure(
          kind === 'offline'
            ? t('enrol.offline')
            : kind === 'unauthorized' || kind === 'invalid' || kind === 'notFound'
              ? t('enrol.codeWrong')
              : t('enrol.failed'),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-gate" data-surface="staff">
      <section className="staff-gate-card card">
        <h1>{t('enrol.title')}</h1>
        {/* A revoked tablet lands here too, and being told plainly why is the
            difference between a manager fixing it in a minute and somebody
            reinstalling the app. Never a redirect back to the keypad: that is
            the loop this screen exists to avoid. */}
        <p className="muted">{reason === 'revoked' ? t('enrol.revoked') : t('enrol.body')}</p>

        <form onSubmit={(event) => void submit(event)}>
          <label className="labelled">
            {t('enrol.code')}
            <input
              className="field big-field"
              value={code}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>

          <label className="labelled">
            {t('enrol.deviceName')}
            <input
              className="field"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              required
            />
            <span className="table-note">{t('enrol.deviceNameWhy')}</span>
          </label>

          {failure ? (
            <p className="error" role="alert">
              {failure}
            </p>
          ) : null}

          <button
            type="submit"
            className="floor-button big full"
            disabled={busy || code.trim().length === 0}
          >
            {busy ? t('enrol.working') : t('enrol.submit')}
          </button>
        </form>
      </section>
    </div>
  );
}
