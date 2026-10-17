import {
  VOID_REASONS,
  type AdjustmentKind,
  type ServiceRequest,
  type StaffTab,
  type TabAdjustment,
  type TabLine,
  type TabStaffParticipant,
  type UserRole,
  type VoidReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { billRequestText } from './billRequestText';
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
 *
 * ## Two things the backend does not tell this screen
 *
 * Both are rendered as unknown rather than as absent, because the difference
 * matters when somebody is holding the bill:
 *
 * - **Why a line was voided.** `TabOrderLine.VoidReason` is stored, required by
 *   the domain, and projected into no read model. The line says it was removed
 *   by staff and stops there.
 * - **What adjustments a tab has.** `POST /api/tabs/{id}/adjustments` answers
 *   with the one it just made; nothing lists them. So the section shows what
 *   this device has done in this session and says plainly that it cannot show
 *   the rest — an empty list captioned "no discounts" would be a claim.
 */

export interface TabPanelProps {
  readonly tab: StaffTab | null;
  /** Assembled from the branch order queue; see `StaffGateway.getTabLines`. */
  readonly lines: readonly TabLine[];
  readonly linesLoading: boolean;
  /** False when the lines were never fetched. Empty and unknown are not the same. */
  readonly linesKnown: boolean;
  /** Adjustments this device has applied in this session. Never the whole set. */
  readonly adjustments: readonly TabAdjustment[];
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly role: UserRole;
  readonly online: boolean;
  readonly loading: boolean;
  /** There is a tab, but this device cannot read it without a connection. */
  readonly offlineUnknown: boolean;
  /** The last cash attempt was refused for exceeding the balance. */
  readonly cashRefusal: { readonly remainingDram: number; readonly requestedDram: number } | null;
  /**
   * What people at the table asked to pay from the app — the whole bill or
   * their own share, and the tip — while those requests are still being
   * handled, newest first. Only requests with amounts (`bill` set). The waiter
   * picks the one the keypad opens on; the newest by default.
   */
  readonly billRequests?: readonly ServiceRequest[];
  readonly onVoid: (line: TabLine, reason: VoidReason, detail?: string) => void;
  readonly onAdjust: (input: {
    lineId: string | null;
    kind: AdjustmentKind;
    percent: number | null;
    amountDram: number | null;
    reason: string;
  }) => void;
  /**
   * Cash taken. `billRequestId` is the request the keypad was opened on, or
   * null when the waiter picked none of them: then nobody is named as the
   * payer and no request is marked handled.
   */
  readonly onCash: (input: {
    amountDram: number;
    tipDram: number;
    billRequestId: string | null;
  }) => void;
  readonly onAskForBill: () => void;
  readonly onAbandon: (reason: string) => void;
  readonly onOrder: () => void;
  readonly onClose: () => void;
}

/** Two letters for a face with no photo: the first of the first two words that are names. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('');
}

/**
 * The person's own photo when their account has one — the waiter's "who is
 * who" at a table of six — and their initials otherwise, or when the photo
 * does not load. Decorative: the name is beside it.
 *
 * A failed load is remembered for that photo only. Keyed by its link, so a
 * new photo (the person changed it, or the tab refetched with fresh links)
 * gets its own try instead of inheriting the old one's failure.
 */
export function ParticipantAvatar({
  person,
  name,
}: {
  readonly person: TabStaffParticipant;
  readonly name: string;
}) {
  const url = person.photo?.thumbnailUrl ?? null;
  return <AvatarFace key={url ?? ''} url={url} initials={initialsOf(name)} />;
}

function AvatarFace({ url, initials }: { readonly url: string | null; readonly initials: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar tab-avatar" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

/** The radio value for "none of these requests": the keypad starts from the balance. */
const NO_REQUEST = '__none__';

/** The roles the server lets move money on a tab: a branch manager and everyone above. */
const MANAGER_ROLES: readonly UserRole[] = ['owner', 'generalManager', 'manager', 'platformAdmin'];

/** Whether this role gets the tab's manager controls: comp, void, adjust, cash, abandon. */
export function isTabManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

export function TabPanel(props: TabPanelProps) {
  const { tab, lines, tableLabel, timeZoneId, role, online, loading, offlineUnknown } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const [voiding, setVoiding] = useState<TabLine | null>(null);
  const [voidReason, setVoidReason] = useState<VoidReason>('wrongItem');
  const [voidDetail, setVoidDetail] = useState('');
  const [adjusting, setAdjusting] = useState<TabLine | null | 'whole'>(null);
  const [adjustKind, setAdjustKind] = useState<AdjustmentKind>('comp');
  const [adjustPercent, setAdjustPercent] = useState('100');
  const [adjustReason, setAdjustReason] = useState('');
  /**
   * The keypad, and the request it was opened on — fixed at the tap, so a
   * request arriving while the waiter types cannot change whose cash this is.
   */
  const [takingCash, setTakingCash] = useState<{ readonly request: ServiceRequest | null } | null>(
    null,
  );
  /** The waiter's pick among the bill requests: an id, {@link NO_REQUEST}, or null for the newest. */
  const [billChoice, setBillChoice] = useState<string | null>(null);
  const pickId = useId();
  const [abandoning, setAbandoning] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState('');

  const isManager = isTabManager(role);
  const totals = tab?.totals;
  const billRequests = (props.billRequests ?? []).filter((request) => request.bill !== null);
  // A pick that has since been handled elsewhere falls back to the newest.
  const chosenBill =
    billChoice === NO_REQUEST
      ? null
      : (billRequests.find((request) => request.id === billChoice) ?? billRequests[0] ?? null);
  const tipsDram = tab?.tipsDram ?? null;

  /** Whose request it is, by the tab's own roster. */
  const requesterName = (request: ServiceRequest): string => {
    const person = request.requestedByParticipantId
      ? tab?.participants.find((candidate) => candidate.id === request.requestedByParticipantId)
      : undefined;
    if (!person) return t('billRequest.someone');
    return person.displayName ?? t('order.whoUnnamed');
  };
  const closed = tab?.status === 'closed' || tab?.status === 'abandoned';
  const closing = tab?.status === 'closing';

  return (
    <div
      className="staff-overlay tab-panel"
      role="dialog"
      aria-label={t('tab.title', { label: tableLabel })}
    >
      <header className="staff-overlay-head">
        <div>
          <h1>{t('tab.title', { label: tableLabel })}</h1>
          {tab ? <p>{t('tab.openedAt', { time: format.time(tab.openedAtUtc) })}</p> : null}
        </div>
        <button type="button" className="button big" onClick={props.onClose}>
          {t('common:action.close')}
        </button>
      </header>

      {loading ? (
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
              {tab.serviceChargePercent !== null ? (
                <div>
                  <dt>{t('tab.serviceCharge', { percent: tab.serviceChargePercent })}</dt>
                  <dd>{format.dram(totals.serviceChargeDram)}</dd>
                </div>
              ) : null}
            </dl>

            {/* Tips are money the venue took, never money the table owes, so
                they sit under the balance and outside it — only once there is
                one, since "tips: 0" next to a bill reads as a hint. */}
            {tipsDram !== null && tipsDram > 0 ? (
              <p className="tab-tips">{t('tab.tips', { amount: format.dram(tipsDram) })}</p>
            ) : null}

            {/* What people asked for from the app, each with their name, so the
                waiter walks over knowing who wants to pay what rather than
                asking again. Two people can ask at once — the host the whole
                bill, a guest their own share — so the waiter picks whose cash
                the keypad is for, and "none of these" keeps a payment nobody
                asked for from being credited to somebody who did. */}
            {billRequests.length > 0 && !closed ? (
              <fieldset className="choice-list tab-bill-requests">
                <legend className="choice-legend">{t('billRequest.pickTitle')}</legend>
                <p className="table-note">{t('billRequest.pickNote')}</p>
                {/* Named by the person, described by what they asked for: two
                    spans run together would read "KarenWants to pay…". */}
                {billRequests.map((request) => (
                  <label key={request.id} className="choice-card">
                    <input
                      type="radio"
                      name="tab-bill-request"
                      value={request.id}
                      checked={chosenBill?.id === request.id}
                      onChange={() => setBillChoice(request.id)}
                      aria-labelledby={`${pickId}-${request.id}-who`}
                      aria-describedby={`${pickId}-${request.id}-what`}
                    />
                    <span className="choice-title" id={`${pickId}-${request.id}-who`}>
                      {requesterName(request)}
                    </span>
                    <span id={`${pickId}-${request.id}-what`}>
                      {billRequestText(request.bill!, t, format.dram, 'wants')}
                    </span>
                  </label>
                ))}
                <label className="choice-card">
                  <input
                    type="radio"
                    name="tab-bill-request"
                    value={NO_REQUEST}
                    checked={chosenBill === null}
                    onChange={() => setBillChoice(NO_REQUEST)}
                    aria-labelledby={`${pickId}-none-who`}
                    aria-describedby={`${pickId}-none-what`}
                  />
                  <span className="choice-title" id={`${pickId}-none-who`}>
                    {t('billRequest.noneTitle')}
                  </span>
                  <span id={`${pickId}-none-what`}>
                    {t('billRequest.noneBody', { amount: format.dram(totals.remainingDram) })}
                  </span>
                </label>
              </fieldset>
            ) : null}

            {closed ? (
              // Closed and freed are not the same thing, and conflating them is
              // how a waiter clears a table people are still sitting at.
              <p className="tab-closed">{t('tab.closedNote')}</p>
            ) : closing ? (
              <p className="table-note">{t('tab.closingNote')}</p>
            ) : null}

            {/* The refusal, with the number that resolves it. Shown here rather
                than inside the keypad because the keypad has been dismissed by
                the time this arrives, and the waiter is looking at the bill. */}
            {props.cashRefusal ? (
              <p className="table-warn" role="alert">
                {t('cash.exceeds', {
                  requested: format.dram(props.cashRefusal.requestedDram),
                  remaining: format.dram(props.cashRefusal.remainingDram),
                })}
              </p>
            ) : null}

            <div className="tab-actions">
              <button
                type="button"
                className="floor-button big full"
                disabled={!online || closed}
                onClick={() => setTakingCash({ request: chosenBill })}
              >
                {t('tab.takeCash')}
              </button>
              {!online ? (
                // Disabled with a plain reason rather than silently absent. A
                // payment recorded against a balance this tablet cannot verify
                // is how a table pays twice, so it waits for the connection.
                <p className="table-note">{t('tab.cashOffline')}</p>
              ) : null}

              {!closed && !closing ? (
                <button
                  type="button"
                  className="button big full"
                  disabled={!online}
                  onClick={props.onAskForBill}
                >
                  {t('tab.askForBill')}
                </button>
              ) : null}

              <button
                type="button"
                className="button big full"
                disabled={closed || closing}
                onClick={props.onOrder}
              >
                {t('tab.addItems')}
              </button>
            </div>
          </section>

          <section className="tab-lines-block">
            <h2>{t('tab.items')}</h2>
            {props.linesLoading ? (
              <p className="floor-todo">{t('tab.linesLoading')}</p>
            ) : !props.linesKnown ? (
              // Not "nothing was ordered". The two look identical on screen and
              // are opposite things to say to somebody holding a bill.
              <p className="table-warn">{t('tab.linesUnknown')}</p>
            ) : lines.length === 0 ? (
              <p className="floor-todo">{t('tab.noItems')}</p>
            ) : (
              <ul className="tab-lines">
                {lines.map((line) => (
                  <li key={line.id} className={`tab-line status-${line.status}`}>
                    <div className="tab-line-main">
                      <span className={line.status === 'active' ? '' : 'struck'}>
                        {line.quantity}× {line.name}
                      </span>
                      <span className={line.status === 'active' ? '' : 'struck'}>
                        {format.dram(
                          line.status === 'active'
                            ? line.lineTotalDram
                            : line.unitPriceDram * line.quantity,
                        )}
                      </span>
                    </div>
                    {line.note ? <p className="order-line-note">{line.note}</p> : null}
                    {line.isShared || line.isTableAttributed ? (
                      <p className="table-note">
                        {line.isShared
                          ? t('tab.sharedWith', { count: line.sharedWithCount })
                          : t('tab.tableAttributed')}
                      </p>
                    ) : null}
                    {line.status !== 'active' ? (
                      // The reason is not on any read model, so the label says
                      // what is true — it was removed by staff — rather than
                      // rendering a slug or an empty dash after a separator.
                      <p className="tab-adjustment">
                        {t('tab.lineStatus.voided')}
                        {line.voidReason ? ` · ${line.voidReason}` : ''}
                        {line.voidedByName ? ` · ${line.voidedByName}` : ''}
                      </p>
                    ) : (
                      <div className="tab-line-actions">
                        <button
                          type="button"
                          className="chip"
                          disabled={!online || closed}
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
                            disabled={!online || closed}
                            onClick={() => {
                              setAdjusting(line);
                              setAdjustKind('comp');
                              setAdjustPercent('100');
                              setAdjustReason('');
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
            <h2>{t('tab.adjustments')}</h2>
            {props.adjustments.length > 0 ? (
              <ul className="tab-lines">
                {props.adjustments.map((adjustment) => (
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
            {/* Always said, even when this device has applied one: the list
                above is this session's, never the tab's. */}
            <p className="table-note">{t('tab.adjustmentsUnknown')}</p>
          </section>

          <section className="tab-shares-block">
            <h2>{t('tab.people')}</h2>
            {tab.participants.length === 0 ? (
              <p className="floor-todo">{t('tab.noPeople')}</p>
            ) : (
              <ul className="tab-shares">
                {tab.participants.map((person) => {
                  const name = person.displayName ?? t('order.whoUnnamed');
                  return (
                    <li key={person.id}>
                      <span className="tab-person">
                        <ParticipantAvatar person={person} name={name} />
                        <span>
                          {name}
                          {person.isHost ? ` · ${t('tab.host')}` : ''}
                        </span>
                      </span>
                      <span className="table-note">{t(`tab.participant.${person.status}`)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {/* The per-person split is `TabParticipant`-scoped on the server, so
                a staff token cannot read it. Said once, plainly, rather than
                rendering an empty "who owes what" that reads as "nobody". */}
            <p className="table-note">{t('tab.sharesStaffBlind')}</p>

            {isManager && !closed ? (
              <div className="tab-manager">
                <button
                  type="button"
                  className="button big"
                  disabled={!online}
                  onClick={() => {
                    setAdjusting('whole');
                    setAdjustKind('comp');
                    setAdjustPercent('100');
                    setAdjustReason('');
                  }}
                >
                  {t('tab.compWhole')}
                </button>
                {/* Placed apart from everything frequent, and behind a typed
                    confirmation with the amount in it. */}
                <button
                  type="button"
                  className="button big danger-spaced"
                  disabled={!online}
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
            {/* The reason is stored as free text and the diner reads it on
                their phone, so it is worth saying that out loud here. */}
            <p className="table-note">{t('tab.voidReasonSeen')}</p>
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

      {/* --- Comp or discount -------------------------------------------------- */}
      {adjusting ? (
        <div className="staff-dialog" role="dialog" aria-label={t('tab.comp')}>
          <div className="card">
            <h2>
              {adjusting === 'whole'
                ? t('tab.compWhole')
                : t('tab.compTitle', { name: adjusting.name })}
            </h2>

            {/* Comp and discount go to the same endpoint and mean different
                things to a venue's own numbers, so the choice is explicit. */}
            <div className="void-reasons">
              {(['comp', 'discount'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`chip big ${adjustKind === kind ? 'is-on' : ''}`}
                  onClick={() => {
                    setAdjustKind(kind);
                    setAdjustPercent(kind === 'comp' ? '100' : '10');
                  }}
                >
                  {t(`tab.adjustmentKind.${kind}`)}
                </button>
              ))}
            </div>

            <label className="labelled">
              {t('tab.percentOff')}
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                value={adjustPercent}
                onChange={(event) => setAdjustPercent(event.target.value)}
              />
            </label>

            <input
              className="field"
              value={adjustReason}
              autoFocus
              placeholder={t('tab.compReason')}
              onChange={(event) => setAdjustReason(event.target.value)}
            />
            <p className="table-note">{t('tab.compReasonSeen')}</p>

            <div className="actions">
              <button
                type="button"
                className="floor-button big"
                disabled={
                  adjustReason.trim().length === 0 ||
                  !(Number(adjustPercent) > 0 && Number(adjustPercent) <= 100)
                }
                onClick={() => {
                  props.onAdjust({
                    lineId: adjusting === 'whole' ? null : adjusting.id,
                    kind: adjustKind,
                    percent: Number(adjustPercent),
                    amountDram: null,
                    reason: adjustReason.trim(),
                  });
                  setAdjusting(null);
                }}
              >
                {t('tab.compConfirm')}
              </button>
              <button type="button" className="button big" onClick={() => setAdjusting(null)}>
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
          prefill={takingCash.request?.bill ?? null}
          timeZoneId={timeZoneId}
          onCancel={() => setTakingCash(null)}
          onConfirm={(input) => {
            props.onCash({ ...input, billRequestId: takingCash.request?.id ?? null });
            setTakingCash(null);
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
