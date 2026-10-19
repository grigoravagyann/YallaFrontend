import type { EnrolmentCode, StaffDevice } from '@yalla/api';
import { useCreateEnrolmentCode, useDevices, useRevokeDevice } from '@yalla/api/react';
import { formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { Dialog } from '../../ui/Dialog';
import { TabletIcon } from '../../ui/icons';
import { OnceLinkDialog } from '../../ui/OnceLinkDialog';
import { useToast } from '../../ui/toast';

export interface DevicesPanelProps {
  readonly branchId: string;
  readonly branchName: string;
  readonly timeZoneId: string;
  readonly locale: Locale;
}

/** "123 456": read out across a room in two halves, as the artboard shows it. */
const spaced = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

/**
 * The tablets a branch runs on, and the code that enrols one (Staff artboard,
 * the card beside the people).
 *
 * The card says plainly what a device grants, which is **nothing on its own**.
 * Every action still needs a PIN on top, so a stolen tablet is not a stolen
 * till — and an owner who does not know that will not revoke one calmly.
 *
 * Each tablet says when it was last seen, or when it enrolled, and nothing
 * about being online: the API has a last-seen time, set on sign-in and on a
 * session renewal, and no presence.
 *
 * The enrolment code is shown once, like a PIN: returned once, only its hash
 * is stored, so it lives in this component's state and nowhere else.
 */
export function DevicesPanel({ branchId, branchName, timeZoneId, locale }: DevicesPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const titleId = useId();

  const devices = useDevices(branchId);
  const createCode = useCreateEnrolmentCode();
  const revoke = useRevokeDevice();

  const [code, setCode] = useState<EnrolmentCode | null>(null);
  const [confirming, setConfirming] = useState<StaffDevice | null>(null);

  const when = (iso: string) =>
    `${formatDate(iso, timeZoneId, locale)} ${formatTime(iso, timeZoneId, locale)}`;

  const list = devices.data ?? [];

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('devices.title')}
          </h2>
          <p className="yc-cap">{t('devices.blurb')}</p>
        </div>
      </div>

      {devices.isError ? (
        <div className="yc-st-pad">
          <QueryFailureNotice error={devices.error} onRetry={() => void devices.refetch()} />
        </div>
      ) : devices.isLoading ? (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      ) : list.length === 0 ? (
        <p className="yc-empty-line">{t('devices.empty')}</p>
      ) : (
        // Revoked tablets stay listed: the list is an audit trail, not a roster.
        <ul className="yc-devs">
          {list.map((device) => (
            <li key={device.id} className="yc-dev">
              <span
                className={device.isRevoked ? 'yc-dev-ic is-gone' : 'yc-dev-ic'}
                aria-hidden="true"
              >
                <TabletIcon />
              </span>
              <span className="yc-dev-t">
                <b>{device.name}</b>
                <small>
                  {device.lastSeenAtUtc
                    ? t('devices.seen', { when: when(device.lastSeenAtUtc) })
                    : t('devices.enrolledOn', { when: when(device.enrolledAtUtc) })}
                </small>
              </span>
              {device.isRevoked ? (
                <span className="yc-pill yc-pill-grey">{t('devices.revoked')}</span>
              ) : (
                <button
                  type="button"
                  className="yc-btn yc-btn-ghost-red yc-btn-sm"
                  data-rev={device.id}
                  aria-label={t('devices.revokeNamed', { name: device.name })}
                  onClick={() => setConfirming(device)}
                >
                  {t('devices.revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="yc-dev-foot">
        <button
          type="button"
          className="yc-btn yc-btn-sec yc-btn-sm"
          data-gen=""
          aria-busy={createCode.isPending}
          onClick={() => {
            if (createCode.isPending) return;
            createCode.mutate(branchId, {
              onSuccess: (made) => {
                setCode(made);
                // The mutation keeps its result as `data`: the dialog's copy is the only one wanted.
                createCode.reset();
              },
              onError: () => toast.say(t('devices.codeFailed'), { tone: 'error' }),
            });
          }}
        >
          {createCode.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {t('devices.generate')}
        </button>
      </div>
      {/* The sentence an owner needs before they can reason about a lost tablet. */}
      <p className="yc-dev-note" role="note">
        {t('devices.grantsNothing')}
      </p>

      {confirming ? (
        <Dialog
          alert
          title={t('devices.confirm.title', { name: confirming.name })}
          description={t('devices.confirm.body', { name: confirming.name })}
          onClose={revoke.isPending ? () => undefined : () => setConfirming(null)}
          dismissible={!revoke.isPending}
          returnFocusTo={() => document.querySelector<HTMLElement>('[data-gen]')}
        >
          <p className="yc-help">{t('devices.confirm.permanent')}</p>
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              disabled={revoke.isPending}
              onClick={() => setConfirming(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-danger"
              aria-busy={revoke.isPending}
              onClick={() => {
                if (revoke.isPending) return;
                const device = confirming;
                revoke.mutate(
                  { branchId, deviceId: device.id },
                  {
                    onSuccess: () => {
                      setConfirming(null);
                      toast.say(t('devices.revokedToast', { name: device.name }));
                    },
                    onError: () => toast.say(t('devices.revokeFailed'), { tone: 'error' }),
                  },
                );
              }}
            >
              {revoke.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
              {t('devices.confirm.revoke')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {code ? (
        <OnceLinkDialog
          title={t('devices.code.title')}
          body={t('devices.code.lead', {
            branch: branchName,
            when: formatTime(code.expiresAtUtc, timeZoneId, locale),
          })}
          link={null}
          pin={spaced(code.code)}
          pinLabel={t('devices.code.label')}
          pinHelp={t('devices.code.onceOnly')}
          doneLabel={t('staff.pin.written')}
          timeZoneId={timeZoneId}
          onDone={() => {
            setCode(null);
            document.querySelector<HTMLElement>('[data-gen]')?.focus();
          }}
        />
      ) : null}
    </section>
  );
}
