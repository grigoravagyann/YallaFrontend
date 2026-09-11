import type { EnrolmentCode, StaffDevice } from '@yalla/api';
import { useCreateEnrolmentCode, useDevices, useRevokeDevice } from '@yalla/api/react';
import { formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';

export interface DevicesPanelProps {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly locale: Locale;
}

/**
 * The tablets a branch runs on, and the code that enrols one.
 *
 * The other half of staff sign-in, and equally unbuilt until now: browser
 * enrolment worked and nothing generated the code, so a venue could not put the
 * counter screen on a tablet at all.
 *
 * The panel says plainly what a device grants, which is **nothing on its own**.
 * Every action still needs a PIN on top, so a stolen tablet is not a stolen
 * till — and an owner who does not know that will not revoke one calmly.
 *
 * Each tablet says when it enrolled and when it was last seen, and nothing
 * about being online: the API has a last-seen time, set on sign-in and on a
 * session renewal, and no presence. A green dot drawn from that would call an
 * idle tablet on the counter offline and a closed one online.
 */
export function DevicesPanel({ branchId, timeZoneId, locale }: DevicesPanelProps) {
  const { t } = useTranslation(['admin', 'common']);

  const devices = useDevices(branchId);
  const createCode = useCreateEnrolmentCode();
  const revoke = useRevokeDevice();

  /**
   * The live code, held in component state and nowhere else.
   *
   * Not in a query cache: it is returned once, only its hash is stored, and a
   * cached credential is one a later render can read. Regenerating is another
   * call rather than a second look at this one, which is what it genuinely is.
   */
  const [code, setCode] = useState<EnrolmentCode | null>(null);
  const [confirming, setConfirming] = useState<StaffDevice | null>(null);

  const when = (iso: string) =>
    `${formatDate(iso, timeZoneId, locale)} ${formatTime(iso, timeZoneId, locale)}`;

  return (
    <section className="page-section" aria-labelledby="devices-title">
      <header className="section-head">
        <div>
          <h3 id="devices-title">{t('devices.title')}</h3>
          <p className="muted">{t('devices.blurb')}</p>
        </div>
        <button
          type="button"
          className="button"
          disabled={createCode.isPending}
          onClick={() => {
            createCode.mutate(branchId, { onSuccess: setCode });
          }}
        >
          {code ? t('devices.regenerate') : t('devices.generate')}
        </button>
      </header>

      {code ? (
        <div className="card enrolment-code">
          <p className="muted small">{t('devices.code.instructions')}</p>
          {/* Large, and spelled out for a screen reader: it is typed onto a
              tablet from across a room. */}
          <p className="enrolment-code-value" aria-label={code.code.split('').join(' ')}>
            {code.code}
          </p>
          <p className="muted small">
            {t('devices.code.expires', { when: when(code.expiresAtUtc) })}
          </p>
          <p className="muted small">{t('devices.code.onceOnly')}</p>
        </div>
      ) : null}

      {devices.isError ? (
        <QueryFailureNotice error={devices.error} onRetry={() => void devices.refetch()} />
      ) : devices.isLoading ? (
        <p className="muted">{t('loading')}</p>
      ) : (devices.data ?? []).length === 0 ? (
        <p className="muted">{t('devices.empty')}</p>
      ) : (
        // Revoked tablets stay listed: the list is an audit trail, not a roster.
        <ul className="device-grid">
          {(devices.data ?? []).map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              enrolled={t('devices.enrolledOn', { when: when(device.enrolledAtUtc) })}
              seen={
                device.lastSeenAtUtc
                  ? t('devices.seen', { when: when(device.lastSeenAtUtc) })
                  : t('devices.neverSeen')
              }
              revokedLabel={t('devices.revoked')}
              revokeLabel={t('devices.revoke')}
              onRevoke={() => setConfirming(device)}
            />
          ))}
        </ul>
      )}

      {/*
        Named in the confirmation, because revoking the wrong one takes a
        venue's counter offline mid-service — and the two cards most likely to
        be confused are "Counter tablet" and "Counter tablet (old)".
      */}
      {confirming ? (
        <div className="scrim" role="presentation">
          <div className="card" role="dialog" aria-modal="true" aria-labelledby="revoke-title">
            <h3 id="revoke-title">{t('devices.confirm.title', { name: confirming.name })}</h3>
            <p>{t('devices.confirm.body', { name: confirming.name })}</p>
            <p className="muted small">{t('devices.confirm.permanent')}</p>
            <div className="actions">
              <button
                type="button"
                className="button button-danger"
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(
                    { branchId, deviceId: confirming.id },
                    { onSuccess: () => setConfirming(null) },
                  );
                }}
              >
                {t('devices.confirm.revoke')}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setConfirming(null)}
              >
                {t('common:action.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* The sentence an owner needs before they can reason about a lost
          tablet at all. A note, so it is announced as one. */}
      <div className="device-note" role="note">
        <svg
          className="device-note-icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <p className="small">{t('devices.grantsNothing')}</p>
      </div>
    </section>
  );
}

interface DeviceCardProps {
  readonly device: StaffDevice;
  readonly enrolled: string;
  readonly seen: string;
  readonly revokedLabel: string;
  readonly revokeLabel: string;
  readonly onRevoke: () => void;
}

function DeviceCard({
  device,
  enrolled,
  seen,
  revokedLabel,
  revokeLabel,
  onRevoke,
}: DeviceCardProps) {
  const nameId = useId();
  return (
    <li>
      <article
        className={`card device-card${device.isRevoked ? ' is-deactivated' : ''}`}
        aria-labelledby={nameId}
      >
        <div className="device-card-head">
          <span className="device-card-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <path d="M12 18h.01" />
            </svg>
          </span>
          <div className="roster-card-who">
            <h4 id={nameId} className="roster-card-name">
              {device.name}
            </h4>
            <p className="muted small">{seen}</p>
            {device.isRevoked ? (
              <p className="roster-card-tags">
                <span className="badge badge-warn">{revokedLabel}</span>
              </p>
            ) : null}
          </div>
          {device.isRevoked ? null : (
            <button type="button" className="button button-small button-danger" onClick={onRevoke}>
              {revokeLabel}
            </button>
          )}
        </div>
        <p className="muted small device-card-foot">{enrolled}</p>
      </article>
    </li>
  );
}
