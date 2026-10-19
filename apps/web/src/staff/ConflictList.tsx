import type { TableStatus, UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../components/useDialogFocus';
import { canSendAnyway } from './commands/conflictPolicy';
import { isTableAction, type ConflictEntry, type QueuedCommand } from './commands/types';
import type { SentCommand } from './commands/useCommandQueue';
import { firstName } from './kitchenBoard';
import { OverlayBar } from './OverlayBar';
import { useBranchFormat } from './useBranchFormat';

/**
 * The conflicts screen (floor-tablet `Conflicts` artboard).
 *
 * A real screen, not a toast. Every card is a thing somebody did that the
 * system could not apply, or that waits for somebody else, and the ways out
 * are a person choosing: discard it, send it anyway where that is safe, or —
 * for a command another person took before handing the tablet over — send it
 * under your own name. Nothing resolves automatically in either direction,
 * and nothing expires: a conflict that disappears on its own is a decision
 * nobody made about somebody's dinner. Beside the cards, the sync queue: what
 * is waiting, what was refused, what went.
 *
 * ## State first, then what happened to the action
 *
 * The first line is the state of the table — "Table 7 is occupied and has an
 * open tab" — because a waiter reading this is standing up, mid-service, and
 * may stop after one line. The action and its time are second; why, in the
 * amber box, third. The table that "changed and changed back" is said apart
 * from the one that simply changed: it reads free and it is not the same free,
 * which nothing else on any screen can show.
 *
 * ## When "send it anyway" is offered
 *
 * `canSendAnyway` decides (`commands/conflictPolicy.ts`), and where it is not
 * offered the card says why, rather than leaving a button out in silence.
 */

export interface ConflictListProps {
  readonly conflicts: readonly ConflictEntry[];
  /** Queued commands taken by somebody other than the person signed in. */
  readonly held: readonly QueuedCommand[];
  /** Everything still queued, held or not. */
  readonly queue: readonly QueuedCommand[];
  /** What this tablet has sent, the latest first. */
  readonly recent: readonly SentCommand[];
  readonly online: boolean;
  /** Who is signed in, so an action is "your" or somebody's by name. */
  readonly actorId: string | null;
  /**
   * Their role: a held command is offered to them only if the server would
   * take it from them (the kitchen moves an order to ready, and nothing else).
   */
  readonly role?: UserRole | undefined;
  readonly timeZoneId: string;
  /** Where the back button goes: the floor, or the kitchen's own screen. */
  readonly backTo: 'floor' | 'kitchen';
  readonly onDiscard: (id: string) => void;
  readonly onApplyAnyway: (id: string) => void;
  readonly onClaim: (id: string) => void;
  readonly onDrop: (id: string) => void;
  readonly onClose: () => void;
}

/** A card this screen settled, kept dimmed with what became of it. */
interface Settled {
  readonly id: string;
  /** It has left the lists since: a later return is a fresh card. */
  readonly left?: boolean;
  readonly label: string;
  readonly head: string;
  readonly result: string;
}

export function ConflictList(props: ConflictListProps) {
  const { conflicts, held, queue, recent, online, actorId, timeZoneId, backTo } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const [settled, setSettled] = useState<readonly Settled[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const focusSettled = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // A modal: it starts on its back button, Escape goes back, Tab stays inside.
  useDialogFocus(dialogRef, { onEscape: props.onClose });

  // The button pressed goes with its card; the focus goes to the card that
  // says what became of it, not to the page (FT4 review S5).
  useEffect(() => {
    const id = focusSettled.current;
    if (!id) return;
    focusSettled.current = null;
    dialogRef.current?.querySelector<HTMLElement>(`[data-settled-id="${CSS.escape(id)}"]`)?.focus();
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4_000);
    return () => clearTimeout(timer);
  }, [toast]);

  const settle = (entry: Settled, toastText: string) => {
    setSettled((current) => [...current.filter((item) => item.id !== entry.id), entry]);
    setToast(toastText);
    focusSettled.current = entry.id;
  };

  // A settled card stands in for its command until the command leaves the
  // lists. Back after that — refused again, or held again — it is its live
  // card once more, not a "sent" one beside it (FT4 review N3). Worked out
  // while rendering, when the lists change, as React advises for state that
  // follows props.
  const liveKey = [...conflicts.map((entry) => entry.command.id), ...held.map((c) => c.id)].join();
  const [seenLiveKey, setSeenLiveKey] = useState(liveKey);
  if (liveKey !== seenLiveKey) {
    setSeenLiveKey(liveKey);
    const live = new Set(liveKey.split(','));
    setSettled((current) =>
      current
        .filter((entry) => !(entry.left && live.has(entry.id)))
        .map((entry) => (!entry.left && !live.has(entry.id) ? { ...entry, left: true } : entry)),
    );
  }
  const standingIn = new Set(settled.filter((entry) => !entry.left).map((entry) => entry.id));
  const shownSettled = settled;
  const openHeld = held.filter((command) => !standingIn.has(command.id));
  const openConflicts = conflicts.filter((entry) => !standingIn.has(entry.command.id));
  const nameOf = (command: QueuedCommand) =>
    firstName(command.by?.name ?? '') || t('conflicts.someone');

  const labelOf = (command: QueuedCommand) => command.subject.tableLabel || '—';
  const action = (command: QueuedCommand) =>
    t(`conflicts.action.${command.kind}`, { count: command.subject.itemCount ?? 0 });
  const isMine = (command: QueuedCommand) =>
    !command.by || !actorId || command.by.staffMemberId === actorId;

  const open = openConflicts.length + openHeld.length;
  const waiting = queue.filter((command) => !held.includes(command)).length;

  const rows = [
    ...queue.map((command) => ({
      command,
      atMs: command.takenAtMs,
      state: held.includes(command)
        ? t('conflicts.queue.state.held', { name: nameOf(command) })
        : t('conflicts.queue.state.waiting'),
      tone: 'wait',
    })),
    ...conflicts.map((entry) => ({
      command: entry.command,
      atMs: entry.command.takenAtMs,
      state: t('conflicts.queue.state.refused'),
      tone: 'fail',
    })),
    ...recent.map((sent) => ({
      command: sent.command,
      atMs: sent.atMs,
      state: t('conflicts.queue.state.sent'),
      tone: 'sent',
    })),
  ];

  return (
    <div
      ref={dialogRef}
      className="staff-overlay ft-conflicts"
      role="dialog"
      aria-modal="true"
      aria-label={t('conflicts.title')}
    >
      <OverlayBar
        back={backTo === 'kitchen' ? t('kitchen.title') : t('floor.title')}
        backName={t(`conflicts.backName.${backTo}`)}
        title={t('conflicts.title')}
        sub={t('conflicts.sub')}
        online={online}
        offlineText={t('connection.chip.offline')}
        onBack={props.onClose}
      />

      <div className="ft-conf-body">
        <section className="ft-conf-main" aria-label={t('conflicts.mainLabel')}>
          {/* Said by what is on the list: a held command did not fail, it
              waits for its person (live QA 4). */}
          {openConflicts.length > 0 ? (
            <p className="ft-conf-intro">{t('conflicts.intro')}</p>
          ) : null}
          {openHeld.length > 0 ? <p className="ft-conf-intro">{t('conflicts.introHeld')}</p> : null}

          {openHeld.map((command) => {
            const name = nameOf(command);
            const label = labelOf(command);
            const claimable = mayMake(props.role, command);
            const head = t('conflicts.held.head', { name });
            return (
              <article
                key={command.id}
                className="ft-conf-card"
                aria-label={`${t('table.title', { label })}. ${head}`}
              >
                <div className="ft-conf-head">
                  <span className="ft-conf-label" aria-hidden="true">
                    {label}
                  </span>
                  <div className="ft-conf-title">
                    <b>{head}</b>
                    <span>
                      {t('conflicts.held.what', {
                        name,
                        action: action(command),
                        time: format.time(command.takenAtMs),
                      })}
                    </span>
                  </div>
                </div>
                <Why text={t('conflicts.held.why', { name })} />
                <div className="ft-conf-actions">
                  <button
                    type="button"
                    className="ft-btn ft-btn-secondary"
                    onClick={() => {
                      props.onDrop(command.id);
                      settle(
                        { id: command.id, label, head, result: t('conflicts.result.discarded') },
                        t('conflicts.toast.discarded', { label }),
                      );
                    }}
                  >
                    {t('conflicts.discard')}
                  </button>
                  {claimable ? (
                    <button
                      type="button"
                      className="ft-btn ft-btn-primary"
                      onClick={() => {
                        props.onClaim(command.id);
                        settle(
                          {
                            id: command.id,
                            label,
                            head,
                            // On its way, not "sent": it may still wait behind
                            // something on its table, or for the connection.
                            result: online
                              ? t('conflicts.result.claimed')
                              : t('conflicts.result.claimedQueued'),
                          },
                          t('conflicts.toast.claimed', { label }),
                        );
                      }}
                    >
                      {t('conflicts.held.claim')}
                    </button>
                  ) : null}
                </div>
                {!claimable ? (
                  <p className="ft-hint">{t('conflicts.held.notForRole', { name })}</p>
                ) : command.kind === 'placeOrder' ? (
                  <p className="ft-hint">{t('conflicts.held.orderNote')}</p>
                ) : null}
              </article>
            );
          })}

          {openConflicts.map((entry) => {
            const { command } = entry;
            const label = entry.observed?.tableLabel || labelOf(command);
            const head = headOf(entry, label, t);
            const anyway = canSendAnyway(entry);
            const anywayLabel = isTableAction(command.kind)
              ? t(`conflicts.applyAnyway.${command.kind}`)
              : '';
            const time = format.time(command.takenAtMs);
            return (
              <article key={command.id} className="ft-conf-card" aria-label={head}>
                <div className="ft-conf-head">
                  <span className="ft-conf-label" aria-hidden="true">
                    {label}
                  </span>
                  <div className="ft-conf-title">
                    <b>{head}</b>
                    <span>
                      {isMine(command)
                        ? t('conflicts.notApplied', { action: action(command), time })
                        : t('conflicts.notAppliedBy', {
                            name: nameOf(command),
                            action: action(command),
                            time,
                          })}
                    </span>
                  </div>
                </div>
                <Why text={whyOf(entry, t)} />
                <div className="ft-conf-actions">
                  {/* Both labels name their own effect: on this screen "OK" and
                      "Cancel" would be two ways of losing somebody's dinner. */}
                  <button
                    type="button"
                    className="ft-btn ft-btn-secondary"
                    onClick={() => {
                      props.onDiscard(command.id);
                      settle(
                        {
                          id: command.id,
                          label,
                          head,
                          result: isTableAction(command.kind)
                            ? t('conflicts.result.discardedTable')
                            : t('conflicts.result.discarded'),
                        },
                        t('conflicts.toast.discarded', { label }),
                      );
                    }}
                  >
                    {t('conflicts.discard')}
                  </button>
                  {anyway.offer ? (
                    <button
                      type="button"
                      className="ft-btn ft-btn-primary"
                      onClick={() => {
                        props.onApplyAnyway(command.id);
                        settle(
                          { id: command.id, label, head, result: t('conflicts.result.sent') },
                          t('conflicts.toast.sent', { label }),
                        );
                      }}
                    >
                      {anywayLabel}
                    </button>
                  ) : null}
                </div>
                <p className="ft-hint">
                  {anyway.offer
                    ? t('conflicts.applyAnywayNote', { label: anywayLabel })
                    : t(`conflicts.noAnyway.${anyway.because}`, {
                        state: t(`conflicts.status.${entry.observed?.currentStatus ?? 'free'}`),
                      })}
                </p>
              </article>
            );
          })}

          {shownSettled.map((entry) => (
            <article
              key={entry.id}
              className="ft-conf-card is-done"
              aria-label={`${entry.head}. ${entry.result}`}
              data-settled-id={entry.id}
              tabIndex={-1}
            >
              <div className="ft-conf-head">
                <span className="ft-conf-label" aria-hidden="true">
                  {entry.label}
                </span>
                <div className="ft-conf-title">
                  <b>{entry.head}</b>
                </div>
              </div>
              <p className="ft-hint">{entry.result}</p>
            </article>
          ))}

          {open === 0 ? (
            <div className="ft-conf-empty">
              <span className="ft-conf-ok" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <b>{t('conflicts.empty')}</b>
              <span>
                {waiting > 0
                  ? t('conflicts.emptyWaiting', { count: waiting })
                  : t('conflicts.emptyAll')}
              </span>
              <button type="button" className="ft-btn ft-btn-primary" onClick={props.onClose}>
                {t(`conflicts.backName.${backTo}`)}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="ft-conf-side" aria-label={t('conflicts.queue.title')}>
          <div className="ft-conf-side-head">
            <h2>{t('conflicts.queue.title')}</h2>
            <p>
              {t('conflicts.queue.summary', {
                waiting: queue.length,
                refused: conflicts.length,
                sent: recent.length,
              })}
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="ft-conf-queue-empty">{t('conflicts.queue.empty')}</p>
          ) : (
            <ul className="ft-conf-queue">
              {rows.map((row) => (
                <li key={`${row.tone}-${row.command.id}-${row.atMs}`}>
                  <span className={`ft-conf-dot is-${row.tone}`} aria-hidden="true" />
                  <span className="ft-conf-queue-text">
                    <b>{queueWhat(row.command, t)}</b>
                    <span>
                      {format.time(row.atMs)} · {row.state}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="ft-conf-side-foot">
            {!online ? (
              <p className="ft-note ft-note-waiting">
                <b>{t('conflicts.offlineLead')}</b> {t('conflicts.offlineBody')}
              </p>
            ) : null}
            <p className="ft-hint">{t('conflicts.queueHint')}</p>
          </div>
        </aside>
      </div>

      {/* Always in the tree, so a screen reader is listening before it speaks. */}
      <p className="ft-conf-toast" role="status">
        {toast ?? ''}
      </p>
    </div>
  );
}

/**
 * Would the server take this command from this role? The kitchen moves an
 * order to ready and nothing else (`RequireKitchenMayMake`); offering it a
 * waiter's seat or order only earns a 403 card (FT4 review S3).
 */
function mayMake(role: UserRole | undefined, command: QueuedCommand): boolean {
  if (role !== 'kitchen') return true;
  return command.body.kind === 'setOrderStatus' && command.body.command.status === 'ready';
}

function Why({ text }: { readonly text: string }) {
  return (
    <p className="ft-conf-why">
      <svg
        className="ft-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <span>{text}</span>
    </p>
  );
}

/** The line that carries the decision: the table's state, or what became of the thing. */
function headOf(entry: ConflictEntry, label: string, t: TFunction): string {
  const { command, observed, refusal } = entry;
  if (refusal?.kind === 'notFound') return t('conflicts.head.gone', { label });
  if (refusal?.kind === 'forbidden') return t('conflicts.head.forbidden', { label });
  if (command.kind === 'placeOrder') return t('conflicts.head.order', { label });
  if (command.kind === 'setOrderStatus') return t('conflicts.head.orderMoved', { label });
  if (command.kind === 'acknowledgeServiceRequest') return t('conflicts.head.call', { label });
  const state = (status: TableStatus) => t(`conflicts.status.${status}`);
  if (observed?.failure === 'tableChangedAndChangedBack') {
    return t('conflicts.head.changedBack', { label, state: state(observed.currentStatus) });
  }
  if (observed) return t('conflicts.head.state', { label, state: state(observed.currentStatus) });
  return t('conflicts.head.unknown', { label });
}

/** Why, in one sentence, from what the server said. */
function whyOf(entry: ConflictEntry, t: TFunction): string {
  const { command, observed, refusal, reason } = entry;
  if (refusal?.kind === 'notFound') {
    return command.kind === 'setOrderStatus'
      ? t('conflicts.why.gone.order')
      : command.kind === 'acknowledgeServiceRequest'
        ? t('conflicts.why.gone.call')
        : t('conflicts.why.gone.table');
  }
  if (refusal?.kind === 'forbidden') return t('conflicts.why.forbidden');
  if (command.kind === 'placeOrder') {
    // The order screen's own sentences, with "a guest" for the name the
    // conflict does not carry.
    if (refusal?.kind === 'soldOut') return t('order.refused.soldOut', { name: refusal.itemName });
    if (refusal?.kind === 'guestUnavailable' && refusal.guestState) {
      return t(`order.refused.guest.${refusal.guestState}`, { name: t('conflicts.aGuest') });
    }
    if (refusal?.kind === 'notAccepting' && refusal.tabStatus) {
      return t(`order.refused.tab.${refusal.tabStatus}`);
    }
    return t(`order.refused.${refusal?.kind ?? 'other'}`);
  }
  if (command.kind === 'setOrderStatus') return t('conflicts.why.orderMoved');
  if (command.kind === 'acknowledgeServiceRequest') return t('conflicts.why.call');
  if (reason === 'refused') {
    return observed ? t('conflicts.reason.refused') : t('conflicts.why.other');
  }
  return observed?.failure === 'tableChangedAndChangedBack'
    ? t('conflicts.why.changedBack')
    : t('conflicts.why.statusChanged');
}

/** A queue row's words: what, and at which table. */
function queueWhat(command: QueuedCommand, t: TFunction): string {
  const label = command.subject.tableLabel || '—';
  const body = command.body;
  if (body.kind === 'setOrderStatus') {
    return t(`conflicts.queue.what.status.${body.command.status}`, { label });
  }
  if (body.kind === 'placeOrder') {
    return t('conflicts.queue.what.placeOrder', { label, count: command.subject.itemCount ?? 0 });
  }
  if (body.kind === 'seatWalkIn' || body.kind === 'seatHeldParty') {
    const party = body.command.partySize;
    if (party) return t(`conflicts.queue.what.${body.kind}Party`, { label, count: party });
  }
  return t(`conflicts.queue.what.${body.kind}`, { label });
}
