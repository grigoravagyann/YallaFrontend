import {
  VOID_REASONS,
  type StaffTab,
  type TabLine,
  type UserRole,
  type VoidReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { CashKeypad } from './CashKeypad';
import { useBranchFormat } from './useBranchFormat';

/**
 * The tab, for staff.
 *
 * The number a waiter needs at a glance is **remaining**, so it is the largest
 * thing on the screen and the other two totals are context beside it. Everything
 * below it exists to answer one of three questions asked at a table: what did we
 * have, what do I owe, and can you take this off.
 *
 * Nothing here may differ from what the diner is looking at on their phone. That
 * is why voided lines are struck through and labelled rather than removed: a
 * line that vanishes from one screen and not the other is an argument, and the
 * diner's phone is the screen that will be believed.
 */

export interface TabPanelProps {
  readonly tab: StaffTab | null;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly role: UserRole;
  readonly online: boolean;
  readonly unavailable: boolean;
  readonly loading: boolean;
  /** There is a tab, but this device cannot read it without a connection. */
  readonly offlineUnknown: boolean;
  readonly onVoid: (line: TabLine, reason: VoidReason, detail?: string) => void;
  readonly onComp: (line: TabLine | null, reason: string) => void;
  readonly onCash: (input: { amountDram: number; tipDram: number }) => void;
  readonly onAbandon: (reason: string) => void;
  readonly onOrder: () => void;
  readonly onClose: () => void;
}

const MANAGER_ROLES: readonly UserRole[] = ['owner', 'manager', 'platformAdmin'];

/**
 * A stored adjustment reason, as a person reads it.
 *
 * The server stores a preset as its slug, so an untranslated line reads
 * "Voided · wrongItem" — which is a developer's word on a screen a waiter shows
 * to a guest. A slug that is one of ours is translated; anything else is
 * somebody's typed sentence and is shown exactly as they wrote it.
 */
function readableReason(reason: string, t: (key: string) => string): string {
  return (VOID_REASONS as readonly string[]).includes(reason)
    ? t(`tab.voidReason.${reason}`)
    : reason;
}

export function TabPanel(props: TabPanelProps) {
  const { tab, tableLabel, timeZoneId, role, online, unavailable, loading, offlineUnknown } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const [voiding, setVoiding] = useState<TabLine | null>(null);
  const [voidReason, setVoidReason] = useState<VoidReason>('wrongItem');
  const [voidDetail, setVoidDetail] = useState('');
  const [comping, setComping] = useState<TabLine | null | 'whole'>(null);
  const [compReason, setCompReason] = useState('');
  const [takingCash, setTakingCash] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState('');

  const isManager = MANAGER_ROLES.includes(role);
  const totals = tab?.totals;
  const closed = tab?.status === 'closed' || tab?.status === 'abandoned';

  return (
    <div className="staff-overlay tab-panel" role="dialog" aria-label={t('tab.title')}>
      <header className="staff-overlay-head">
        <div>
          <h1>{t('tab.title', { label: tableLabel })}</h1>
          {tab ? <p>{t('tab.openedAt', { time: format.time(tab.openedAtUtc) })}</p> : null}
        </div>
        <button type="button" className="button big" onClick={props.onClose}>
          {t('common:action.close')}
        </button>
      </header>

      {unavailable ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('tab.notWired')}</p>
        </div>
      ) : loading ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('floor.loading')}</p>
        </div>
      ) : offlineUnknown ? (
        <div className="staff-overlay-body">
          <p className="table-warn">{t('tab.offlineUnknown')}</p>
        </div>
      ) : !tab || !totals ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('tab.none')}</p>
        </div>
      ) : (
        <div className="tab-body">
          <section className="tab-money">
            {/* Remaining, largest. The other two are the sum it came from. */}
            <p className="tab-remaining-label">{t('tab.remaining')}</p>
            <p className="tab-remaining">{format.dram(totals.remainingDram)}</p>
            <dl className="tab-totals">
              <div>
                <dt>{t('tab.total')}</dt>
                <dd>{format.dram(totals.totalDram)}</dd>
              </div>
              <div>
                <dt>{t('tab.paid')}</dt>
                <dd>{format.dram(totals.paidDram)}</dd>
              </div>
            </dl>

            {closed ? (
              // Closed and freed are not the same thing, and conflating them is
              // how a waiter clears a table people are still sitting at.
              <p className="tab-closed">{t('tab.closedNote')}</p>
            ) : null}

            <div className="tab-actions">
              <button
                type="button"
                className="floor-button big full"
                disabled={!online || closed}
                onClick={() => setTakingCash(true)}
              >
                {t('tab.takeCash')}
              </button>
              {!online ? (
                // Disabled with a plain reason rather than silently absent. A
                // payment recorded against a balance this tablet cannot verify
                // is how a table pays twice, so it waits for the connection.
                <p className="table-note">{t('tab.cashOffline')}</p>
              ) : null}

              <button type="button" className="button big full" onClick={props.onOrder}>
                {t('tab.addItems')}
              </button>
            </div>
          </section>

          <section className="tab-lines-block">
            <h2>{t('tab.items')}</h2>
            {tab.lines.length === 0 ? (
              <p className="floor-todo">{t('tab.noItems')}</p>
            ) : (
              <ul className="tab-lines">
                {tab.lines.map((line) => (
                  <li key={line.id} className={`tab-line status-${line.status}`}>
                    <div className="tab-line-main">
                      <span className={line.status === 'active' ? '' : 'struck'}>
                        {line.quantity}× {line.name}
                      </span>
                      <span className={line.status === 'active' ? '' : 'struck'}>
                        {format.dram(line.lineTotalDram)}
                      </span>
                    </div>
                    {line.note ? <p className="order-line-note">{line.note}</p> : null}
                    {line.status !== 'active' ? (
                      <p className="tab-adjustment">
                        {t(`tab.lineStatus.${line.status}`)}
                        {line.voidReason ? ` · ${readableReason(line.voidReason, t)}` : ''}
                        {line.voidedByName ? ` · ${line.voidedByName}` : ''}
                      </p>
                    ) : (
                      <div className="tab-line-actions">
                        <button
                          type="button"
                          className="chip"
                          onClick={() => {
                            setVoiding(line);
                            setVoidReason('wrongItem');
                            setVoidDetail('');
                          }}
                        >
                          {t('tab.void')}
                        </button>
                        {isManager ? (
                          <button
                            type="button"
                            className="chip"
                            onClick={() => {
                              setComping(line);
                              setCompReason('');
                            }}
                          >
                            {t('tab.comp')}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Adjustments are their own rows with the manager's reason on
                them. Folded into a total, a bill quietly shrinks and nobody
                can say why. */}
            {tab.adjustments.length > 0 ? (
              <ul className="tab-lines">
                {tab.adjustments.map((adjustment) => (
                  <li key={adjustment.id} className="tab-line status-adjustment">
                    <div className="tab-line-main">
                      <span>{t(`tab.adjustmentKind.${adjustment.kind}`)}</span>
                      <span>−{format.dram(adjustment.reductionDram)}</span>
                    </div>
                    <p className="tab-adjustment">
                      {adjustment.reason}
                      {adjustment.byName ? ` · ${adjustment.byName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="tab-shares-block">
            <h2>{t('tab.shares')}</h2>
            {tab.shares.length === 0 ? (
              <p className="floor-todo">{t('tab.noShares')}</p>
            ) : (
              <ul className="tab-shares">
                {tab.shares.map((share) => (
                  <li key={share.participantId}>
                    <span>{share.displayName ?? t('order.whoUnnamed')}</span>
                    <strong>{format.dram(share.shareDram)}</strong>
                  </li>
                ))}
              </ul>
            )}

            {isManager && !closed ? (
              <div className="tab-manager">
                <button
                  type="button"
                  className="button big"
                  onClick={() => {
                    setComping('whole');
                    setCompReason('');
                  }}
                >
                  {t('tab.compWhole')}
                </button>
                {/* Placed apart from everything frequent, and behind a typed
                    confirmation with the amount in it. */}
                <button
                  type="button"
                  className="button big danger-spaced"
                  onClick={() => {
                    setAbandoning(true);
                    setAbandonConfirm('');
                  }}
                >
                  {t('tab.abandon')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {/* --- Void ------------------------------------------------------------ */}
      {voiding ? (
        <div className="staff-dialog" role="dialog" aria-label={t('tab.void')}>
          <div className="card">
            <h2>{t('tab.voidTitle', { name: voiding.name })}</h2>
            <div className="void-reasons">
              {VOID_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className={`chip big ${voidReason === reason ? 'is-on' : ''}`}
                  onClick={() => setVoidReason(reason)}
                >
                  {t(`tab.voidReason.${reason}`)}
                </button>
              ))}
            </div>
            {voidReason === 'other' ? (
              <input
                className="field"
                value={voidDetail}
                autoFocus
                placeholder={t('tab.voidDetail')}
                onChange={(event) => setVoidDetail(event.target.value)}
              />
            ) : null}
            <div className="actions">
              <button
                type="button"
                className="floor-button big"
                disabled={voidReason === 'other' && voidDetail.trim().length === 0}
                onClick={() => {
                  props.onVoid(voiding, voidReason, voidDetail.trim() || undefined);
                  setVoiding(null);
                }}
              >
                {t('tab.voidConfirm')}
              </button>
              <button type="button" className="button big" onClick={() => setVoiding(null)}>
                {t('common:action.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Comp ------------------------------------------------------------ */}
      {comping ? (
        <div className="staff-dialog" role="dialog" aria-label={t('tab.comp')}>
          <div className="card">
            <h2>
              {comping === 'whole'
                ? t('tab.compWhole')
                : t('tab.compTitle', { name: comping.name })}
            </h2>
            <input
              className="field"
              value={compReason}
              autoFocus
              placeholder={t('tab.compReason')}
              onChange={(event) => setCompReason(event.target.value)}
            />
            <div className="actions">
              <button
                type="button"
                className="floor-button big"
                disabled={compReason.trim().length === 0}
                onClick={() => {
                  props.onComp(comping === 'whole' ? null : comping, compReason.trim());
                  setComping(null);
                }}
              >
                {t('tab.compConfirm')}
              </button>
              <button type="button" className="button big" onClick={() => setComping(null)}>
                {t('common:action.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Cash ------------------------------------------------------------ */}
      {takingCash && totals ? (
        <CashKeypad
          remainingDram={totals.remainingDram}
          timeZoneId={timeZoneId}
          onCancel={() => setTakingCash(false)}
          onConfirm={(input) => {
            props.onCash(input);
            setTakingCash(false);
          }}
        />
      ) : null}

      {/* --- Abandon ---------------------------------------------------------- */}
      {abandoning && totals ? (
        <div className="staff-dialog" role="dialog" aria-label={t('tab.abandon')}>
          <div className="card">
            <h2>{t('tab.abandon')}</h2>
            {/* The amount is in the confirmation text, because "are you sure"
                without a number is a question nobody reads. */}
            <p className="table-warn">
              {t('tab.abandonWarn', { amount: format.dram(totals.remainingDram) })}
            </p>
            <label className="labelled">
              {t('tab.abandonType', { word: t('tab.abandonWord') })}
              <input
                className="field"
                value={abandonConfirm}
                autoFocus
                onChange={(event) => setAbandonConfirm(event.target.value)}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="button big danger-spaced"
                disabled={abandonConfirm.trim().toLocaleUpperCase() !== t('tab.abandonWord')}
                onClick={() => {
                  props.onAbandon(t('tab.abandonReason'));
                  setAbandoning(false);
                }}
              >
                {t('tab.abandonConfirm')}
              </button>
              <button type="button" className="button big" onClick={() => setAbandoning(false)}>
                {t('common:action.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
