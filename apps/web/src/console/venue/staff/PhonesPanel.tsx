import {
  KitchenPhoneNotAllowedError,
  canSetStaffPin,
  type PhonePairingCode,
  type StaffActorRef,
  type StaffDevice,
  type StaffMember,
} from '@yalla/api';
import { useCreatePhonePairing, useDevices, useRevokeDevice } from '@yalla/api/react';
import { formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/toast';
import { PairPhoneDialog } from './PairPhoneDialog';
import { phoneDeviceName } from './phoneDeviceName';

export interface PhonesPanelProps {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly locale: Locale;
  /** The people who sign in at this branch: its own and the venue-wide ones. */
  readonly people: readonly StaffMember[];
  /** Who is acting, for the staff-admin rule on each row. */
  readonly actor: StaffActorRef;
}

/** While a pairing code is up, the phones are read this often: the dialog says when it pairs. */
const PAIRING_POLL_MS = 5_000;

/** Who may issue codes at all: manager or above (`ManagerOrAbove`). */
const PAIRING_ROLES: ReadonlySet<string> = new Set([
  'platformAdmin',
  'owner',
  'generalManager',
  'manager',
]);

/**
 * Staff → Phones (Devices artboard): everybody who works at the branch, the
 * phone each has paired, when it was last seen, and the one thing to do —
 * pair one, or unpair it.
 *
 * A row per person rather than per device, because the question a manager
 * comes here with is "has Aram got his phone yet", not "which browsers are
 * enrolled". The kitchen has no phone (the kitchen stays on its tablet), so
 * its rows say so and offer nothing. A person the actor may not manage —
 * above their role, or another branch's — is listed with no button, as the
 * People tab does.
 */
export function PhonesPanel({ branchId, timeZoneId, locale, people, actor }: PhonesPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const titleId = useId();

  const [pairing, setPairing] = useState<{
    readonly member: StaffMember;
    readonly code: PhonePairingCode;
    /** When this code was issued: a phone enrolled since is the one it paired. */
    readonly issuedAtMs: number;
  } | null>(null);
  const [confirming, setConfirming] = useState<{
    readonly member: StaffMember;
    readonly device: StaffDevice;
  } | null>(null);

  const devices = useDevices(branchId, {
    kind: 'phone',
    ...(pairing ? { pollMs: PAIRING_POLL_MS } : {}),
  });
  const create = useCreatePhonePairing();
  const revoke = useRevokeDevice();

  const may = PAIRING_ROLES.has(actor.role);
  const phones = (devices.data ?? []).filter(
    (device) => device.kind === 'phone' && !device.isRevoked && device.boundStaffMember,
  );
  /** A person's live phone, the newest when (briefly) there are two. */
  const phoneOf = (memberId: string) =>
    phones
      .filter((device) => device.boundStaffMember?.id === memberId)
      .sort((a, b) => b.enrolledAtUtc.localeCompare(a.enrolledAtUtc))[0] ?? null;

  const when = (iso: string) =>
    `${formatDate(iso, timeZoneId, locale)} ${formatTime(iso, timeZoneId, locale)}`;

  const rows = people.filter((member) => member.isActive);

  function issue(member: StaffMember) {
    if (create.isPending) return;
    create.mutate(
      { branchId, staffMemberId: member.id },
      {
        onSuccess: (code) => {
          setPairing({ member, code, issuedAtMs: Date.now() });
          // The mutation keeps its result as `data`: the dialog's copy is the only one wanted.
          create.reset();
        },
        onError: (error) =>
          toast.say(
            error instanceof KitchenPhoneNotAllowedError
              ? t('phones.kitchenRefused')
              : t('phones.pairFailed'),
            { tone: 'error' },
          ),
      },
    );
  }

  const pairButton = (id: string) => () =>
    document.querySelector<HTMLElement>(`[data-pair="${CSS.escape(id)}"]`) ??
    document.querySelector<HTMLElement>(`[data-unpair="${CSS.escape(id)}"]`);

  /** The phone this code paired, once it shows up in the list. */
  const pairedNow = pairing
    ? (phones.find(
        (device) =>
          device.boundStaffMember?.id === pairing.member.id &&
          // A minute's grace for the server's clock and this one disagreeing.
          Date.parse(device.enrolledAtUtc) >= pairing.issuedAtMs - 60_000,
      ) ?? null)
    : null;

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('phones.title')}
          </h2>
          <p className="yc-cap">{t('phones.blurb')}</p>
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
      ) : rows.length === 0 ? (
        <p className="yc-empty-line">{t('phones.empty')}</p>
      ) : (
        <div className="yc-tscroll">
          <table className="yc-tbl yc-phones" aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">{t('phones.column.person')}</th>
                <th scope="col">{t('phones.column.phone')}</th>
                <th scope="col">{t('phones.column.seen')}</th>
                <th scope="col">
                  <span className="yc-sr">{t('phones.column.action')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const phone = phoneOf(member.id);
                const kitchen = member.role === 'kitchen';
                const allowed = may && canSetStaffPin(actor, member);
                return (
                  <tr key={member.id}>
                    <th scope="row" className="yc-phones-who">
                      {member.fullName}
                      <span>{t(`role.${member.role}`)}</span>
                    </th>
                    <td>
                      {phone ? (
                        phoneDeviceName(t, phone)
                      ) : (
                        <span className="yc-muted">{t('phones.notPaired')}</span>
                      )}
                    </td>
                    <td className="yc-muted">
                      {phone
                        ? phone.lastSeenAtUtc
                          ? when(phone.lastSeenAtUtc)
                          : t('phones.never')
                        : '—'}
                    </td>
                    <td className="yc-phones-act">
                      {kitchen ? (
                        <span className="yc-muted">{t('phones.kitchen')}</span>
                      ) : !allowed ? (
                        <span className="yc-muted">{t('staff.action.notYours')}</span>
                      ) : phone ? (
                        <button
                          type="button"
                          className="yc-btn yc-btn-ghost-red yc-btn-sm"
                          data-unpair={member.id}
                          aria-label={t('phones.unpairNamed', { name: member.fullName })}
                          onClick={() => setConfirming({ member, device: phone })}
                        >
                          {t('phones.unpair')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="yc-btn yc-btn-pri yc-btn-sm"
                          data-pair={member.id}
                          aria-label={t('phones.pairNamed', { name: member.fullName })}
                          aria-busy={
                            create.isPending && create.variables?.staffMemberId === member.id
                          }
                          onClick={() => issue(member)}
                        >
                          {t('phones.pair')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pairing ? (
        <PairPhoneDialog
          name={pairing.member.fullName}
          pairing={pairing.code}
          renewing={create.isPending}
          paired={pairedNow}
          returnFocusTo={pairButton(pairing.member.id)}
          onRenew={() => issue(pairing.member)}
          onClose={() => {
            setPairing(null);
            void devices.refetch();
          }}
        />
      ) : null}

      {confirming ? (
        <Dialog
          alert
          title={t('phones.confirm.title', { name: confirming.member.fullName })}
          description={t('phones.confirm.body', {
            device: phoneDeviceName(t, confirming.device),
          })}
          onClose={revoke.isPending ? () => undefined : () => setConfirming(null)}
          dismissible={!revoke.isPending}
          returnFocusTo={pairButton(confirming.member.id)}
        >
          <p className="yc-help">{t('phones.confirm.again')}</p>
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
                const { member, device } = confirming;
                revoke.mutate(
                  { branchId, deviceId: device.id },
                  {
                    onSuccess: () => {
                      setConfirming(null);
                      toast.say(t('phones.unpairedToast', { name: member.fullName }));
                    },
                    onError: () => toast.say(t('phones.unpairFailed'), { tone: 'error' }),
                  },
                );
              }}
            >
              {revoke.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
              {t('phones.confirm.unpair')}
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
