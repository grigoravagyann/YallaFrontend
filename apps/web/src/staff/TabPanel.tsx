import {
  VOID_REASONS,
  type AdjustmentKind,
  type OrderStatus,
  type ServiceRequest,
  type StaffTab,
  type TabLine,
  type TabStaffParticipant,
  type UserRole,
  type VoidReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useDialogFocus } from '../components/useDialogFocus';
import { billRequestText } from './billRequestText';
import { CashKeypad, type CashOutcome } from './CashKeypad';
import { OverlayBar } from './OverlayBar';
import { useBranchFormat } from './useBranchFormat';
import { useMinuteClock } from './useMinuteClock';

/**
 * The tab, for staff (floor-tablet `Tab`).
 *
 * Left, what was ordered: every line with where it is (in the kitchen, ready,
 * served, voided), who it is for, when its order went in (the branch's clock,
 * as the diner's bill says it) and its note. Right, the money: what the table
 * asked to pay from the app, the totals down to what is still to pay, and the
 * actions. The number a waiter needs at a glance is **still to pay**, so it
 * closes the totals in the largest type.
 *
 * Nothing here may differ from what the diner is looking at on their phone. That
 * is why voided lines are struck through and labelled rather than removed: a
 * line that vanishes from one screen and not the other is an argument, and the
 * diner's phone is the screen that will be believed.
 *
 * ## Who may do what (HANDOFF §3, decided by the user)
 *
 * A waiter and above takes cash (with the tip), voids a line with a reason and
 * answers the bill request. A manager and above alone comps a line, takes a
 * percentage or an amount off the whole tab, and marks it unpaid — the server's
 * `ManagerOrAbove`. A waiter does not see those three at all; one muted line
 * where they would be says who does.
 *
 * ## One snapshot
 *
 * The lines (voided ones with their reason, phone orders with who placed
 * them), every adjustment on the tab from whichever device made it, the
 * service percentage and the totals all come from the one staff read of the
 * tab. Nothing here adds a number from one moment to a number from another:
 * the discount row is what the adjustments took off, not the lines' sum less
 * a subtotal that refreshed on its own.
 */

export interface TabPanelProps {
  /** The tab with its lines and adjustments, from one read. */
  readonly tab: StaffTab | null;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly role: UserRole;
  /** Who is signed in, for the cash screen's bar. */
  readonly staffName?: string | null | undefined;
  /** How many sat down, from the floor. */
  readonly partySize?: number | null | undefined;
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
   * Cash taken, answered with what became of it. `billRequest` is the request
   * the keypad was opened on, as it stood then — not looked up again, because
   * it can leave the open list while the waiter types (another tablet answers
   * it, or the diner asks again) and the cash is still that person's. Null when
   * the waiter picked none of them: then nobody is named as the payer and no
   * request is marked handled.
   */
  readonly onCash: (input: {
    amountDram: number;
    tipDram: number;
    /** The keypad's, reused on a retry of the same payment. */
    clientCommandId: string;
    billRequest: ServiceRequest | null;
  }) => Promise<CashOutcome>;
  readonly onAskForBill: () => void;
  readonly onAbandon: (reason: string) => void;
  readonly onOrder: () => void;
  /** From the "paid in full" card: back to the table, to free it. */
  readonly onFreeTable?: (() => void) | undefined;
  readonly onClose: () => void;
  /**
   * Opened from the table panel's "Take cash": the keypad comes up at once, on
   * the newest bill request as the tab's own button would, instead of one tap
   * later. It still waits for the tab to load, and needs the connection.
   */
  readonly openOnCash?: boolean | undefined;
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

/** The roles the server lets decide about money on a tab: a branch manager and everyone above. */
const MANAGER_ROLES: readonly UserRole[] = ['owner', 'generalManager', 'manager', 'platformAdmin'];

/**
 * Whether this role gets the tab's manager controls: comp a line, take a
 * percentage or an amount off the whole tab, and mark it unpaid — the server's
 * `ManagerOrAbove`. Voiding a line, taking cash and answering the bill request
 * are every waiter's.
 */
export function isTabManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** The pill on a line: where it is. A voided line says so whatever its order did. */
function lineStage(line: TabLine): OrderStatus {
  return line.status === 'voided' ? 'voided' : line.orderStatus;
}

const COMP_REASONS = ['longWait', 'regular', 'birthday', 'other'] as const;
const DISCOUNT_PERCENTS = [5, 10, 15, 20] as const;

type Dialog =
  | { readonly kind: 'line'; readonly line: TabLine; readonly step: 'menu' | 'void' }
  | { readonly kind: 'comp'; readonly line: TabLine | null }
  | { readonly kind: 'abandon' };

export function TabPanel(props: TabPanelProps) {
  const { tab, tableLabel, timeZoneId, role, online, loading, offlineUnknown } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const now = useMinuteClock();
  const pickId = useId();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  /**
   * The keypad, and the request it was opened on — fixed at the tap, so a
   * request arriving while the waiter types cannot change whose cash this is.
   */
  const [takingCash, setTakingCash] = useState<{
    readonly request: ServiceRequest | null;
    /** Recorded: its card stays up even though the payment closed the tab. */
    readonly recorded: boolean;
  } | null>(() =>
    props.openOnCash && online
      ? {
          request: (props.billRequests ?? []).find((request) => request.bill !== null) ?? null,
          recorded: false,
        }
      : null,
  );
  /** The waiter's pick among the bill requests: an id, {@link NO_REQUEST}, or null for the newest. */
  const [billChoice, setBillChoice] = useState<string | null>(null);

  const isManager = isTabManager(role);
  const totals = tab?.totals;
  const billRequests = (props.billRequests ?? []).filter((request) => request.bill !== null);
  // A pick that has since been handled elsewhere falls back to the newest.
  const chosenBill =
    billChoice === NO_REQUEST
      ? null
      : (billRequests.find((request) => request.id === billChoice) ?? billRequests[0] ?? null);
  const tipsDram = tab?.tipsDram ?? null;

  const nameOf = (person: TabStaffParticipant | undefined): string =>
    person?.displayName ?? t('order.whoUnnamed');
  /** Whose request it is, by the tab's own roster. */
  const requesterName = (request: ServiceRequest): string => {
    const person = request.requestedByParticipantId
      ? tab?.participants.find((candidate) => candidate.id === request.requestedByParticipantId)
      : undefined;
    return person ? nameOf(person) : t('billRequest.someone');
  };
  const closed = tab?.status === 'closed' || tab?.status === 'abandoned';
  const closing = tab?.status === 'closing';

  const lines = tab?.lines ?? [];
  const linesKnown = tab?.linesKnown ?? false;
  // Reversed ones stay on the record and take nothing off.
  const adjustments = (tab?.adjustments ?? []).filter((adjustment) => !adjustment.isVoided);
  const activeLines = lines.filter((line) => line.status === 'active');
  const linesDram = activeLines.reduce((sum, line) => sum + line.lineTotalDram, 0);
  const dishCount = activeLines.reduce((sum, line) => sum + line.quantity, 0);
  // What the adjustments took off, as the server worked each out.
  const adjustedDram = adjustments.reduce((sum, adjustment) => sum + adjustment.reductionDram, 0);
  // The tab has been paid against: the server refuses a void then (a refund).
  const paidAgainst = (totals?.paidDram ?? 0) > 0;
  // What the keypad will open on: a share capped at what is left; the whole
  // bill as it stands now.
  const cashAmount = totals
    ? chosenBill?.bill?.scope === 'mine'
      ? Math.min(chosenBill.bill.amountDram, totals.remainingDram)
      : totals.remainingDram
    : 0;

  const whoFor = (line: TabLine): string | null => {
    if (line.isShared) return t('tab.whoShared');
    if (line.isTableAttributed) return t('tab.tableAttributed');
    if (line.onBehalfOfParticipantId) {
      return nameOf(tab?.participants.find((person) => person.id === line.onBehalfOfParticipantId));
    }
    // Ordered from their own phone.
    if (line.participantId) {
      return (
        line.orderedByName ??
        nameOf(tab?.participants.find((person) => person.id === line.participantId))
      );
    }
    return null;
  };
  /** A comp or a discount on one line, said on the line with its reason. */
  const lineAdjustments = (line: TabLine) =>
    adjustments.filter((adjustment) => adjustment.lineId === line.id);

  const minutesOpen = tab
    ? Math.max(0, Math.floor((now.getTime() - new Date(tab.openedAtUtc).getTime()) / 60_000))
    : 0;

  const lineActions = !online || closed;

  return (
    <div
      className="staff-overlay ft-tab"
      role="dialog"
      aria-label={t('tab.title', { label: tableLabel })}
    >
      <OverlayBar
        back={t('order.back', { label: tableLabel })}
        backName={t('order.backName', { label: tableLabel })}
        title={t('tab.title', { label: tableLabel })}
        sub={
          tab
            ? [
                t('tab.openSince', { time: format.time(tab.openedAtUtc), minutes: minutesOpen }),
                props.partySize ? t('order.people', { count: props.partySize }) : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        online={online}
        offlineText={t('connection.chip.offline')}
        onBack={props.onClose}
      />

      {loading ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('floor.loading')}</p>
        </div>
      ) : offlineUnknown ? (
        <div className="staff-overlay-body">
          <p className="ft-note ft-note-waiting">{t('tab.offlineUnknown')}</p>
        </div>
      ) : !tab || !totals ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('tab.none')}</p>
        </div>
      ) : (
        <div className="ft-tab-body">
          {/* --- What was ordered ------------------------------------------ */}
          <section className="ft-tab-left" aria-labelledby={`${pickId}-ordered`}>
            <div className="ft-tab-head">
              <h2 id={`${pickId}-ordered`}>{t('tab.ordered')}</h2>
              {linesKnown ? (
                <span className="ft-tab-count">
                  {`${t('tab.lines', { count: activeLines.length })} · ${t('order.dishes', { count: dishCount })}`}
                </span>
              ) : null}
              <span className="ft-top-gap" />
              {tab.participants.length > 0 ? (
                <ul className="ft-people" aria-label={t('tab.people')}>
                  {tab.participants.map((person) => {
                    const name = nameOf(person);
                    return (
                      <li key={person.id} className={person.isHost ? 'is-host' : undefined}>
                        <ParticipantAvatar person={person} name={name} />
                        <span>
                          {name}
                          {person.isHost ? ` · ${t('tab.host')}` : ''}
                          {person.status === 'approved'
                            ? ''
                            : ` · ${t(`tab.participant.${person.status}`)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="ft-tab-count">{t('tab.noPeople')}</span>
              )}
            </div>

            <div className="ft-tab-lines">
              {!linesKnown ? (
                // Not "nothing was ordered". The two look identical on screen and
                // are opposite things to say to somebody holding a bill.
                <p className="ft-note ft-note-waiting">{t('tab.linesUnknown')}</p>
              ) : lines.length === 0 ? (
                <p className="floor-todo">{t('tab.noItems')}</p>
              ) : (
                <ul className="tab-lines">
                  {lines.map((line) => {
                    const stage = lineStage(line);
                    const who = whoFor(line);
                    return (
                      <li key={line.id} className={`tab-line status-${line.status}`}>
                        <span className="tab-line-qty">{line.quantity}×</span>
                        <span className="tab-line-main">
                          <span className="tab-line-name">{line.name}</span>
                          <span className="tab-line-meta">
                            <span className={`tab-pill stage-${stage}`}>
                              {t(`tab.lineStatus.${stage}`)}
                              {line.status === 'voided' && line.voidReason
                                ? ` · ${line.voidReason}`
                                : ''}
                            </span>
                            {who || line.placedAtUtc ? (
                              // "Ani · 19:08": who, then when its order went in.
                              <span>
                                {who}
                                {who && line.placedAtUtc ? ' · ' : null}
                                {line.placedAtUtc ? (
                                  <time dateTime={line.placedAtUtc}>
                                    {format.time(line.placedAtUtc)}
                                  </time>
                                ) : null}
                              </span>
                            ) : null}
                            {line.note ? <span>{`“${line.note}”`}</span> : null}
                            {lineAdjustments(line).map((adjustment) => (
                              <span key={adjustment.id} className="tab-line-adjusted">
                                {`${t(`tab.adjustmentKind.${adjustment.kind}`)} · ${adjustment.reason}`}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="tab-line-price">
                          {format.dram(
                            line.status === 'active'
                              ? line.lineTotalDram
                              : line.unitPriceDram * line.quantity,
                          )}
                        </span>
                        {line.status === 'active' ? (
                          <button
                            type="button"
                            className="ft-icon-button"
                            aria-label={t('tab.lineActions', { name: line.name })}
                            disabled={lineActions}
                            onClick={() => setDialog({ kind: 'line', line, step: 'menu' })}
                          >
                            <svg
                              className="ft-icon"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        ) : (
                          <span />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Whole-tab adjustments are their own rows with the manager's
                  reason on them; a line's is said on the line. Folded into a
                  total, a bill quietly shrinks and nobody can say why. */}
              {adjustments.some((adjustment) => adjustment.lineId === null) ? (
                <ul className="tab-adjustments">
                  {adjustments
                    .filter((adjustment) => adjustment.lineId === null)
                    .map((adjustment) => (
                      <li key={adjustment.id}>
                        <span>
                          {`${t(`tab.adjustmentKind.${adjustment.kind}`)} · ${adjustment.reason}`}
                        </span>
                        <span>−{format.dram(adjustment.reductionDram)}</span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          </section>

          {/* --- The money ---------------------------------------------------- */}
          <section className="ft-tab-right" aria-labelledby={`${pickId}-money`}>
            <h2 className="visually-hidden" id={`${pickId}-money`}>
              {t('tab.toPay')}
            </h2>
            {/* What people asked for from the app, each with their name, so the
                waiter walks over knowing who wants to pay what rather than
                asking again. Two people can ask at once — the host the whole
                bill, a guest their own share — so the waiter picks whose cash
                the keypad is for, and "none of these" keeps a payment nobody
                asked for from being credited to somebody who did. */}
            {billRequests.length > 0 && !closed ? (
              <fieldset className="ft-request">
                <legend>
                  <span>{t('billRequest.pickTitle')}</span>
                  <small>
                    {t('billRequest.askedAgo', {
                      count: Math.max(
                        0,
                        Math.floor(
                          (now.getTime() - new Date(billRequests[0]!.requestedAtUtc).getTime()) /
                            60_000,
                        ),
                      ),
                    })}
                  </small>
                </legend>
                <p>{t('billRequest.pickNote')}</p>
                {/* Named by the person, described by what they asked for: two
                    spans run together would read "KarenWants to pay…". */}
                {billRequests.map((request) => (
                  <label key={request.id} className="ft-request-option">
                    <input
                      type="radio"
                      name={`${pickId}-bill-request`}
                      value={request.id}
                      checked={chosenBill?.id === request.id}
                      onChange={() => setBillChoice(request.id)}
                      aria-labelledby={`${pickId}-${request.id}-who`}
                      aria-describedby={`${pickId}-${request.id}-what`}
                    />
                    <span className="ft-request-who" id={`${pickId}-${request.id}-who`}>
                      {requesterName(request)}
                    </span>
                    <span id={`${pickId}-${request.id}-what`}>
                      {billRequestText(request.bill!, t, format.dram, 'wants')}
                    </span>
                  </label>
                ))}
                <label className="ft-request-option">
                  <input
                    type="radio"
                    name={`${pickId}-bill-request`}
                    value={NO_REQUEST}
                    checked={chosenBill === null}
                    onChange={() => setBillChoice(NO_REQUEST)}
                    aria-labelledby={`${pickId}-none-who`}
                    aria-describedby={`${pickId}-none-what`}
                  />
                  <span className="ft-request-who" id={`${pickId}-none-who`}>
                    {t('billRequest.noneTitle')}
                  </span>
                  <span id={`${pickId}-none-what`}>
                    {t('billRequest.noneBody', { amount: format.dram(totals.remainingDram) })}
                  </span>
                </label>
              </fieldset>
            ) : null}

            <dl className="tab-totals">
              <div>
                <dt>{linesKnown ? t('tab.dishes') : t('tab.dishesAfter')}</dt>
                <dd>{format.dram(linesKnown ? linesDram : totals.subtotalDram)}</dd>
              </div>
              {adjustedDram > 0 ? (
                <div className="is-muted">
                  <dt>{t('tab.adjusted')}</dt>
                  <dd>−{format.dram(adjustedDram)}</dd>
                </div>
              ) : null}
              {tab.serviceChargePercent !== null ? (
                <div className="is-muted">
                  <dt>{t('tab.serviceCharge', { percent: tab.serviceChargePercent })}</dt>
                  <dd>{format.dram(totals.serviceChargeDram)}</dd>
                </div>
              ) : null}
              <div className="is-big">
                <dt>{t('tab.total')}</dt>
                <dd>{format.dram(totals.totalDram)}</dd>
              </div>
              <div className="is-muted">
                <dt>{t('tab.paid')}</dt>
                <dd>{format.dram(totals.paidDram)}</dd>
              </div>
              <div className="is-big is-owed">
                <dt>{t('tab.toPay')}</dt>
                <dd>{format.dram(totals.remainingDram)}</dd>
              </div>
            </dl>

            {/* Tips are money the venue took, never money the table owes, so
                they sit under the balance and outside it — only once there is
                one, since "tips: 0" next to a bill reads as a hint. */}
            {tipsDram !== null && tipsDram > 0 ? (
              <p className="ft-hint">{t('tab.tips', { amount: format.dram(tipsDram) })}</p>
            ) : null}
            <p className="ft-hint">{t('tab.sharesStaffBlind')}</p>

            {closed ? (
              // Closed and freed are not the same thing, and conflating them is
              // how a waiter clears a table people are still sitting at.
              <p className="ft-note ft-note-info">{t('tab.closedNote')}</p>
            ) : closing ? (
              <p className="ft-note ft-note-info">{t('tab.closingNote')}</p>
            ) : null}

            {/* The refusal, with the number that resolves it. Shown here rather
                than inside the keypad because the keypad has been dismissed by
                the time this arrives, and the waiter is looking at the bill. */}
            {props.cashRefusal ? (
              <p className="ft-note ft-note-failure" role="alert">
                {t('cash.exceeds', {
                  requested: format.dram(props.cashRefusal.requestedDram),
                  remaining: format.dram(props.cashRefusal.remainingDram),
                })}
              </p>
            ) : null}

            <div className="ft-tab-actions">
              <button
                type="button"
                className="ft-btn ft-btn-ok ft-btn-big"
                // Nothing owed is nothing to take: a tip alone has no balance to ride on.
                disabled={!online || closed || totals.remainingDram === 0}
                onClick={() => setTakingCash({ request: chosenBill, recorded: false })}
              >
                {closed || totals.remainingDram === 0
                  ? t('tab.takeCash')
                  : t('tab.takeCashAmount', { amount: format.dram(cashAmount) })}
              </button>
              {!online ? (
                // Disabled with a plain reason rather than silently absent. A
                // payment recorded against a balance this tablet cannot verify
                // is how a table pays twice, so it waits for the connection.
                <p className="ft-note ft-note-waiting">{t('tab.cashOffline')}</p>
              ) : null}
              <div className="ft-tab-row">
                <button
                  type="button"
                  className="ft-btn ft-btn-secondary"
                  disabled={closed || closing}
                  onClick={props.onOrder}
                >
                  {t('tab.addDish')}
                </button>
                {!closed && !closing ? (
                  <button
                    type="button"
                    className="ft-btn ft-btn-secondary"
                    disabled={!online}
                    onClick={props.onAskForBill}
                  >
                    {t('tab.askForBill')}
                  </button>
                ) : null}
              </div>
              {closed ? null : isManager ? (
                <>
                  <button
                    type="button"
                    className="ft-btn ft-btn-secondary"
                    disabled={!online}
                    onClick={() => setDialog({ kind: 'comp', line: null })}
                  >
                    {t('tab.discountWhole')}
                  </button>
                  {/* Placed apart from everything frequent, and behind a typed
                      confirmation with the amount in it. */}
                  <hr className="ft-sep" />
                  <button
                    type="button"
                    className="ft-btn ft-btn-ghost"
                    disabled={!online}
                    onClick={() => setDialog({ kind: 'abandon' })}
                  >
                    {t('tab.markUnpaid')}
                  </button>
                </>
              ) : (
                <p className="ft-hint ft-manager-only">{t('tab.managerOnly')}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* --- A line's menu, and voiding it --------------------------------- */}
      {dialog?.kind === 'line' ? (
        <LineDialog
          key={dialog.line.id}
          line={dialog.line}
          step={dialog.step}
          canComp={isManager}
          paidAgainst={paidAgainst}
          heading={`${dialog.line.quantity}× ${dialog.line.name} · ${format.dram(dialog.line.lineTotalDram)}`}
          onStep={(step) => setDialog({ ...dialog, step })}
          onComp={() => setDialog({ kind: 'comp', line: dialog.line })}
          onVoid={(reason, detail) => {
            props.onVoid(dialog.line, reason, detail);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Comp a line, or a discount on the whole tab -------------------- */}
      {dialog?.kind === 'comp' ? (
        <CompDialog
          line={dialog.line}
          formatDram={format.dram}
          onApply={(input) => {
            props.onAdjust(input);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Mark unpaid ----------------------------------------------------- */}
      {dialog?.kind === 'abandon' && totals ? (
        <AbandonDialog
          amount={format.dram(totals.remainingDram)}
          onConfirm={() => {
            props.onAbandon(t('tab.abandonReason'));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Cash ------------------------------------------------------------ */}
      {/* Never on a closed or abandoned tab, however the keypad was asked for —
          except for the card of the payment that just closed it. */}
      {takingCash && totals && (!closed || takingCash.recorded) ? (
        <CashKeypad
          tableLabel={tableLabel}
          totals={totals}
          request={
            takingCash.request?.bill
              ? { name: requesterName(takingCash.request), bill: takingCash.request.bill }
              : null
          }
          staffName={props.staffName ?? null}
          partySize={props.partySize}
          timeZoneId={timeZoneId}
          online={online}
          onRecord={async (input) => {
            const outcome = await props.onCash({ ...input, billRequest: takingCash.request });
            if (outcome.kind === 'recorded') {
              setTakingCash((current) => (current ? { ...current, recorded: true } : current));
            }
            return outcome;
          }}
          onBack={() => setTakingCash(null)}
          onFloor={props.onClose}
          onFreeTable={props.onFreeTable ?? props.onClose}
        />
      ) : null}
    </div>
  );
}

/** A modal over the tab: a scrim, a card, focus kept inside, Escape to close. */
function TabDialog(props: {
  readonly heading: string;
  readonly alert?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useDialogFocus(ref, { onEscape: props.onClose });
  return (
    <div
      className="ft-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={ref}
        className="ft-dialog"
        role={props.alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 id={headingId}>{props.heading}</h2>
        {props.children}
      </div>
    </div>
  );
}

/** The reasons as a grid of choices, nothing picked; "Other" asks for the words. */
function ReasonPicker<R extends string>(props: {
  readonly reasons: readonly R[];
  readonly label: (reason: R) => string;
  readonly picked: R | null;
  readonly onPick: (reason: R) => void;
  readonly detail: string;
  readonly onDetail: (detail: string) => void;
  readonly missing: boolean;
}) {
  const { t } = useTranslation('staff');
  return (
    <>
      <div className="ft-reasons">
        {props.reasons.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={props.picked === reason}
            onClick={() => props.onPick(reason)}
          >
            {props.label(reason)}
          </button>
        ))}
      </div>
      {props.picked === 'other' ? (
        <input
          className="ft-field"
          aria-label={t('tab.reason')}
          placeholder={t('tab.reasonPlaceholder')}
          value={props.detail}
          autoFocus
          onChange={(event) => props.onDetail(event.target.value)}
        />
      ) : null}
      {props.missing ? (
        <p className="ft-error" role="alert">
          {t('tab.pickReason')}
        </p>
      ) : null}
    </>
  );
}

function LineDialog(props: {
  readonly line: TabLine;
  readonly step: 'menu' | 'void';
  readonly canComp: boolean;
  /** The tab has been paid against: the server refuses a void (a refund). */
  readonly paidAgainst: boolean;
  readonly heading: string;
  readonly onStep: (step: 'menu' | 'void') => void;
  readonly onComp: () => void;
  readonly onVoid: (reason: VoidReason, detail?: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const noteId = useId();
  const [reason, setReason] = useState<VoidReason | null>(null);
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  // "Other" is a reason only with the words: the diner reads them.
  const complete = reason !== null && (reason !== 'other' || detail.trim().length > 0);

  return (
    <TabDialog heading={props.heading} onClose={props.onClose}>
      {props.step === 'menu' ? (
        <>
          <div className="ft-dialog-row">
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={props.paidAgainst}
              aria-describedby={props.paidAgainst ? `${noteId}-paid` : undefined}
              onClick={() => props.onStep('void')}
            >
              {t('tab.voidLine')}
            </button>
            {props.canComp ? (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onComp}>
                {t('tab.compLine')}
              </button>
            ) : null}
          </div>
          {/* Said before the tap rather than after a refusal: a void on a tab
              somebody has paid against is a refund, which the server refuses. */}
          {props.paidAgainst ? (
            <p className="ft-dialog-note" id={`${noteId}-paid`}>
              {t('tab.voidAfterPayment')}
            </p>
          ) : null}
          <button type="button" className="ft-btn ft-btn-ghost" onClick={props.onClose}>
            {t('common:action.close')}
          </button>
        </>
      ) : (
        <>
          <p className="ft-dialog-note">{t('tab.voidWhy')}</p>
          <ReasonPicker
            reasons={VOID_REASONS}
            label={(value) => t(`tab.voidReason.${value}`)}
            picked={reason}
            onPick={setReason}
            detail={detail}
            onDetail={setDetail}
            missing={tried && !complete}
          />
          <div className="ft-dialog-row">
            <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-danger-solid"
              onClick={() => {
                if (!complete) return setTried(true);
                props.onVoid(reason, reason === 'other' ? detail.trim() : undefined);
              }}
            >
              {t('tab.voidLine')}
            </button>
          </div>
        </>
      )}
    </TabDialog>
  );
}

function CompDialog(props: {
  /** A line to comp, or null for a discount on the whole tab. */
  readonly line: TabLine | null;
  readonly formatDram: (amount: number) => string;
  readonly onApply: (input: {
    lineId: string | null;
    kind: AdjustmentKind;
    percent: number | null;
    amountDram: number | null;
    reason: string;
  }) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [reason, setReason] = useState<(typeof COMP_REASONS)[number] | null>(null);
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  const [percent, setPercent] = useState<number | null>(10);
  /** Whole dram, typed as digits only: a separator or a decimal never gets in. */
  const [amount, setAmount] = useState('');
  const line = props.line;

  const reasonText =
    reason === null ? '' : reason === 'other' ? detail.trim() : t(`tab.compReason.${reason}`);
  const amountDram = amount === '' ? 0 : Number(amount);
  const sizeMissing = line === null && percent === null && amountDram <= 0;

  const apply = () => {
    if (!reasonText || sizeMissing) return setTried(true);
    // The reason goes as words in the tablet's language, exactly as if the
    // manager had typed them: the diner reads it on their phone.
    props.onApply(
      line
        ? { lineId: line.id, kind: 'comp', percent: 100, amountDram: null, reason: reasonText }
        : {
            lineId: null,
            kind: 'discount',
            percent,
            amountDram: percent === null ? amountDram : null,
            reason: reasonText,
          },
    );
  };

  return (
    <TabDialog
      heading={line ? t('tab.compTitle', { name: line.name }) : t('tab.discountWhole')}
      onClose={props.onClose}
    >
      <p className="ft-dialog-note">{t('tab.compSeen')}</p>
      {line === null ? (
        <>
          <div className="ft-percents" role="group" aria-label={t('tab.discountSize')}>
            {DISCOUNT_PERCENTS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={percent === value}
                onClick={() => setPercent(value)}
              >
                {`${value} %`}
              </button>
            ))}
            <button type="button" aria-pressed={percent === null} onClick={() => setPercent(null)}>
              {t('tab.discountAmount')}
            </button>
          </div>
          {percent === null ? (
            <input
              className="ft-field"
              inputMode="numeric"
              aria-label={t('tab.discountAmountLabel')}
              value={amount}
              autoFocus
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/gu, '').replace(/^0+/u, '').slice(0, 8))
              }
            />
          ) : null}
          {tried && sizeMissing ? (
            <p className="ft-error" role="alert">
              {t('tab.enterAmount')}
            </p>
          ) : null}
        </>
      ) : null}
      <ReasonPicker
        reasons={COMP_REASONS}
        label={(value) => t(`tab.compReason.${value}`)}
        picked={reason}
        onPick={setReason}
        detail={detail}
        onDetail={setDetail}
        missing={tried && !reasonText}
      />
      <div className="ft-dialog-row">
        <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="ft-btn ft-btn-primary" onClick={apply}>
          {line
            ? t('tab.compGive')
            : percent !== null
              ? t('tab.discountApplyPercent', { percent })
              : t('tab.discountApplyAmount', { amount: props.formatDram(amountDram) })}
        </button>
      </div>
    </TabDialog>
  );
}

function AbandonDialog(props: {
  readonly amount: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const word = t('tab.markUnpaidWord');
  const matches = typed.trim().toLocaleUpperCase() === word;
  return (
    <TabDialog heading={t('tab.markUnpaidTitle')} alert onClose={props.onClose}>
      {/* The amount is in the warning, because "are you sure" without a
          number is a question nobody reads. */}
      <p className="ft-note ft-note-failure">{t('tab.markUnpaidWarn', { amount: props.amount })}</p>
      <label className="ft-field-label" htmlFor={fieldId}>
        {t('tab.markUnpaidType', { word })}
      </label>
      <input
        id={fieldId}
        className={`ft-field ${typed && !matches ? 'is-bad' : ''}`}
        autoComplete="off"
        value={typed}
        autoFocus
        onChange={(event) => setTyped(event.target.value)}
      />
      <div className="ft-dialog-row">
        <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="ft-btn ft-btn-danger-solid"
          disabled={!matches}
          onClick={props.onConfirm}
        >
          {t('tab.markUnpaidConfirm')}
        </button>
      </div>
    </TabDialog>
  );
}
