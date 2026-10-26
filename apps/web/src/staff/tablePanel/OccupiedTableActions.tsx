import type { FloorTable, ServiceRequest, StaffTableDetail, TableActionKind } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { GuestRecordLine } from '../../console/venue/overview/GuestRecordLine';
import { AdmissionDecision, type AdmissionOutcome, type AdmissionSubject } from '../AdmissionPanel';
import { billRequestText } from '../billRequestText';
import type { TransferTarget } from '../transferTarget';
import { useBranchFormat } from '../useBranchFormat';
import { Confirm, Fact, Facts, Warn } from './panelParts';
import { TransferChoice } from './TransferChoice';

/** Handing the table to another waiter, when it is offered. */
export interface OccupiedTransfer {
  /** The chooser is open. */
  readonly open: boolean;
  readonly targets: readonly TransferTarget[] | null;
  readonly failed: boolean;
  readonly notYours: boolean;
  readonly transferring: boolean;
  readonly onOpen: () => void;
  readonly onCancel: () => void;
  readonly onTransfer: (target: TransferTarget) => void;
}

export interface OccupiedTableActionsProps {
  readonly table: FloorTable;
  readonly detail: StaffTableDetail | undefined;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly pending: boolean;
  /** What is still owed on the table's tab, or `null`. */
  readonly balance: number | null;
  /** The tab is closed or abandoned. */
  readonly tabDone: boolean;
  /** Minutes the party has sat, or `null`. */
  readonly seatedFor: number | null;
  /** The party has sat long, as the card says. */
  readonly long: boolean;
  readonly bookingStart: string | null | undefined;
  /** The next booking, as its fact's value. */
  readonly nextBooking: ReactNode;
  readonly billRequest: ServiceRequest | null | undefined;
  readonly admission: AdmissionSubject | null | undefined;
  readonly branchId: string | null | undefined;
  readonly onAdmissionDecided: ((outcome: AdmissionOutcome) => void) | undefined;
  readonly onStartTab: () => void;
  readonly startingTab: boolean;
  readonly onOrder: () => void;
  readonly onOpenTab: () => void;
  readonly onCash: () => void;
  /** Absent where a transfer is not offered. */
  readonly transfer: OccupiedTransfer | null;
  /** "Free the table" is asking first. */
  readonly confirmFree: boolean;
  readonly onConfirmFree: (asking: boolean) => void;
  readonly onAct: (kind: TableActionKind, input?: { partySize?: number }) => void;
}

/** A seated table: its facts and warnings, the tab's actions, a transfer, and "free". */
export function OccupiedTableActions({
  table,
  detail,
  timeZoneId,
  online,
  pending,
  balance,
  tabDone,
  seatedFor,
  long,
  bookingStart,
  nextBooking,
  billRequest,
  admission,
  branchId,
  onAdmissionDecided,
  onStartTab,
  startingTab,
  onOrder,
  onOpenTab,
  onCash,
  transfer,
  confirmFree,
  onConfirmFree,
  onAct,
}: OccupiedTableActionsProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  return (
    <>
      <Facts>
        <Fact label={t('table.seatedFor')} warn={long}>
          {seatedFor !== null ? t('table.minutes', { count: seatedFor }) : '—'}
          {/* The party sitting here promised to be gone by a time: said with it. */}
          {detail?.sittingPromisedFreeByUtc ? (
            <small>
              {t('table.mustFreeBy', {
                time: format.time(detail.sittingPromisedFreeByUtc),
              })}
            </small>
          ) : null}
        </Fact>
        <Fact label={t('table.party')}>
          {detail?.partySize ?? '—'}
          {/* Seated on a proved guest's booking: their record (wire §0a). */}
          <GuestRecordLine
            record={detail?.sittingGuestRecord}
            surface="staff"
            timeZoneId={timeZoneId}
            now={new Date()}
            className="tp-record"
          />
        </Fact>
        <Fact label={t('table.fact.bill')}>{balance !== null ? format.dram(balance) : '—'}</Fact>
        {detail?.serverName ? (
          <Fact label={t('table.fact.server')} text>
            {detail.serverName}
          </Fact>
        ) : null}
        {bookingStart ? <Fact label={t('table.nextBooking')}>{nextBooking}</Fact> : null}
      </Facts>

      {long ? (
        <Warn tone="amber">
          <b>{t('table.warn.long')}</b>{' '}
          {bookingStart
            ? t('table.warn.longNext', { time: format.time(bookingStart) })
            : detail?.sittingPromisedFreeByUtc
              ? t('table.warn.longPromised', {
                  time: format.time(detail.sittingPromisedFreeByUtc),
                })
              : null}
        </Warn>
      ) : null}

      {billRequest?.bill ? (
        <Warn tone="blue">
          <b>
            {t('table.billAsked', {
              count: Math.max(0, format.minutesSince(billRequest.requestedAtUtc)),
            })}
          </b>{' '}
          {billRequestText(billRequest.bill, t, format.dram, 'wants')}
        </Warn>
      ) : null}

      {/* A scan with no verified number: nobody on the tab can order until
      a waiter who can see the table lets them. */}
      {admission && branchId ? (
        <section className="tp-admission" aria-label={t('admission.panelTitle')}>
          <Warn tone="amber">
            <b>{t('admission.panelTitle')}</b> {t('admission.why')}
          </Warn>
          <AdmissionDecision
            branchId={branchId}
            subject={admission}
            online={online}
            variant="panel"
            onDecided={(outcome) => onAdmissionDecided?.(outcome)}
          />
        </section>
      ) : null}

      <div className="tp-acts">
        {/* Orders need a tab. A guest opens one by scanning; for a party
        that will not, the waiter starts one here. Online only — it
        is not a floor command the tablet queues — and not while this
        table's seating is itself still waiting to sync, because the
        server has nobody seated there to bill yet. */}
        {detail && detail.openTabId === null ? (
          <>
            <Warn tone="amber">
              <b>{t('table.noTab')}</b> {t('table.noTabWhy')}
            </Warn>
            <button
              type="button"
              className="tp-btn tp-pri"
              onClick={onStartTab}
              disabled={!online || pending || startingTab}
            >
              {startingTab ? t('table.action.startingTab') : t('table.action.startTab')}
            </button>
            {!online ? <p className="tp-hint">{t('table.startTabNeedsOnline')}</p> : null}
          </>
        ) : (
          <>
            <div className="tp-row">
              <button type="button" className="tp-btn tp-pri" onClick={onOrder}>
                {t('table.action.takeOrder')}
              </button>
              <button type="button" className="tp-btn tp-sec" onClick={onOpenTab}>
                {t('table.action.openTab')}
              </button>
            </div>
            {/* A payment recorded against a balance this tablet cannot
            verify is how a table pays twice, so cash waits for the
            connection, as it does on the tab. */}
            <button
              type="button"
              className="tp-btn tp-ok"
              disabled={!online || tabDone}
              onClick={onCash}
            >
              {/* The keypad opens on the newest bill request when there
              is one — a share, or with a tip — so the label names
              the balance only when that is what the keypad shows. */}
              {balance !== null && balance > 0 && !billRequest?.bill
                ? t('table.action.cash', { amount: format.dram(balance) })
                : t('tab.takeCash')}
            </button>
            {!online ? <p className="tp-hint">{t('table.cashNeedsOnline')}</p> : null}
          </>
        )}

        {/* Hand the table to another waiter (2026-10-24): the bill, its
        messages and its calls go to them from now on. Online only:
        it is not a command the tablet queues. */}
        {transfer ? (
          transfer.open ? (
            <TransferChoice
              label={table.label}
              targets={transfer.targets}
              failed={transfer.failed}
              notYours={transfer.notYours}
              disabled={!online || pending || transfer.transferring}
              online={online}
              onTransfer={transfer.onTransfer}
              onCancel={transfer.onCancel}
            />
          ) : (
            <>
              <button
                type="button"
                className="tp-btn tp-sec"
                disabled={!online}
                onClick={transfer.onOpen}
              >
                {t('table.transfer.action')}
              </button>
              {!online ? <p className="tp-hint">{t('table.transfer.needsOnline')}</p> : null}
            </>
          )
        ) : null}

        {/* Destructive, so it sits under a rule rather than beside the
        thumb that just tapped "take an order", and asks first. The
        diners have physically left, so nothing stops it: the money
        goes to "needs resolving", it is not lost. */}
        <hr className="tp-sep" />
        {confirmFree ? (
          <Confirm title={t('table.free.title', { label: table.label })}>
            <p className="tp-hint">
              {balance !== null && balance > 0
                ? t('table.free.owed', { amount: format.dram(balance) })
                : t('table.free.note')}
            </p>
            <div className="tp-row">
              <button type="button" className="tp-btn tp-sec" onClick={() => onConfirmFree(false)}>
                {t('common:action.cancel')}
              </button>
              <button
                type="button"
                className="tp-btn tp-danger-fill"
                onClick={() => onAct('freeTable')}
              >
                {t('table.action.freeConfirm')}
              </button>
            </div>
          </Confirm>
        ) : (
          <button type="button" className="tp-btn tp-danger" onClick={() => onConfirmFree(true)}>
            {t('table.action.free')}
          </button>
        )}
      </div>
    </>
  );
}
