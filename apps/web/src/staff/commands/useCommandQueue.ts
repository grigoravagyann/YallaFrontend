import {
  newCommandId,
  type StaffFloor,
  type StaffGateway,
  type TableActionResult,
} from '@yalla/api';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { commandStore, type CommandStore } from '../../offline/commandStore';
import {
  commandReducer,
  conflictCount,
  initialCommandState,
  isLiveRace,
  optimisticFloor,
  pendingCount,
  projectedStatus,
  type CommandAction,
} from './reducer';
import { heldFor, isHeld, sendableInOrder } from './conflictPolicy';
import { sendCommand } from './sync';
import {
  isQueueable,
  takenOfflineNow,
  type CommandAuthor,
  type CommandState,
  type ConflictEntry,
  type NewCommand,
  type QueuedCommand,
} from './types';

/**
 * The queue, wired to a gateway and to IndexedDB.
 *
 * This hook is the only impure part of the offline story. Everything it decides
 * it decides by asking `commandReducer` and `sendCommand`, which are pure and
 * tested; what is left here is when to replay and what to persist.
 */

export interface CommandQueue {
  readonly state: CommandState;
  /** Derived from the queue, never counted alongside it. */
  readonly pending: number;
  readonly conflicts: number;
  /**
   * Queued commands taken by somebody other than the person signed in. Not
   * sent until that person signs in again, or somebody here claims or drops
   * them (`conflictPolicy.ts`).
   */
  readonly held: readonly QueuedCommand[];
  /** What this tablet has sent since it was opened, the latest first. */
  readonly recent: readonly SentCommand[];
  readonly online: boolean;
  readonly syncing: boolean;
  /** True once the durable queue has been read back. */
  readonly ready: boolean;

  /**
   * Queue a command and return whether it was accepted.
   *
   * `false` means the kind is not queueable — a payment. The caller is expected
   * to have disabled that path already; this is the backstop.
   */
  enqueue(command: NewCommand): boolean;
  /** Send everything now. Called on reconnect and after each enqueue. */
  sync(): void;
  discard(id: string): void;
  /** Re-send a conflict without its precondition, under the person signed in. */
  applyAnyway(id: string): void;
  /** Send somebody else's held command under the person signed in. */
  claim(id: string): void;
  /** Drop somebody else's held command: a person's choice, never the device's. */
  drop(id: string): void;
  /** The status a table will be in once the queue drains, for preconditions. */
  projected(tableId: string): ReturnType<typeof projectedStatus>;
  /** The floor with unsent commands applied and marked. */
  overlay(floor: StaffFloor | null): ReturnType<typeof optimisticFloor> | null;
}

export interface UseCommandQueueOptions {
  readonly gateway: StaffGateway;
  readonly floor: StaffFloor | null;
  /** Called for each applied table action, so the caller can refresh. */
  readonly onApplied?: ((result: TableActionResult) => void) | undefined;
  /**
   * Called when any command leaves the queue by succeeding.
   *
   * Separate from `onApplied` because that one carries a table transition's
   * result and most commands do not have one. This is what tells the screen
   * that the order it queued has actually landed, so the panel it should appear
   * in can be refetched — without it, an order placed offline stays invisible
   * until something else happens to invalidate that query.
   */
  readonly onSettled?: ((command: QueuedCommand) => void) | undefined;
  /**
   * Somebody took the table in the seconds the panel was open.
   *
   * Handled here rather than in the conflict list because it is not a conflict
   * a person has to adjudicate: the waiter is still standing in front of the
   * panel, and the answer is to redraw the floor and say who took it.
   */
  readonly onLiveRace?: ((entry: ConflictEntry) => void) | undefined;
  readonly store?: CommandStore;
  /**
   * Who is signed in. Stamped on every command taken, and the person whose
   * commands are sent; null where there is no staff sign-in (the mock).
   */
  readonly actor?: CommandAuthor | null | undefined;
  /**
   * False while the tablet is locked.
   *
   * The queue keeps everything it holds — locking is not signing out — but it
   * stops sending, because there is no session token and a screen quietly
   * firing 401s at a backend is not a paused screen.
   */
  readonly enabled?: boolean | undefined;
}

/** A command this tablet sent, for the conflicts screen's queue list. */
export interface SentCommand {
  readonly command: QueuedCommand;
  readonly atMs: number;
}

/** The queue list shows the latest few; older ones have long stopped mattering. */
const RECENT_KEPT = 12;

export function useCommandQueue(options: UseCommandQueueOptions): CommandQueue {
  const { gateway, floor } = options;
  const store = options.store ?? commandStore;
  const enabled = options.enabled ?? true;

  const [state, dispatch] = useReducer(commandReducer, initialCommandState);
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<readonly SentCommand[]>([]);
  const actor = options.actor ?? null;
  const actorId = actor?.staffMemberId ?? null;
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  // Refs so the replay loop reads the current values without being re-created
  // on every render, which would restart it constantly.
  //
  // Written in an effect rather than during render. A ref mutated while
  // rendering is torn under a re-entrant render, and the value the loop would
  // read is the one from a render React went on to throw away. This effect is
  // declared first, so it has already run by the time the replay effect below
  // fires in the same commit.
  const stateRef = useRef(state);
  const floorRef = useRef(floor);
  const onAppliedRef = useRef(options.onApplied);
  const onLiveRaceRef = useRef(options.onLiveRace);
  const onSettledRef = useRef(options.onSettled);
  const enabledRef = useRef(enabled);
  const actorRef = useRef(actor);
  const running = useRef(false);
  /** Asked to sync while a pass was running: run again when it ends. */
  const again = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    floorRef.current = floor;
    onAppliedRef.current = options.onApplied;
    onLiveRaceRef.current = options.onLiveRace;
    onSettledRef.current = options.onSettled;
    enabledRef.current = enabled;
    actorRef.current = actor;
  });

  // --- Hydrate --------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [queue, conflicts] = await Promise.all([store.loadQueue(), store.loadConflicts()]);
      if (cancelled) return;
      dispatch({ type: 'hydrated', queue, conflicts });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once: re-reading the store after the first render would
    // resurrect commands this session has already sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both lists are written back on every change. `ready` guards the first
  // render, so an empty initial state cannot erase what is on disk before the
  // restore has finished reading it.
  useEffect(() => {
    if (!ready) return;
    void store.saveQueue(state.queue);
  }, [ready, state.queue, store]);

  useEffect(() => {
    if (!ready) return;
    void store.saveConflicts(state.conflicts);
  }, [ready, state.conflicts, store]);

  // --- Connection -----------------------------------------------------------

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // --- Replay ---------------------------------------------------------------

  const sync = useCallback(() => {
    if (running.current) {
      again.current = true;
      return;
    }
    if (!enabledRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (stateRef.current.queue.length === 0) return;

    running.current = true;
    dispatch({ type: 'syncStarted' });

    void (async () => {
      try {
        // A scope that fails is skipped for the rest of this pass. The next
        // command on that table depends on the one that just failed, so sending
        // it now would apply them out of order; other tables are unaffected,
        // which is what keeps one stuck table from freezing the floor. A command
        // somebody else took is not sent at all, nor anything behind it.
        const blocked = new Set<string>();
        const signedIn = actorRef.current?.staffMemberId ?? null;

        for (const command of sendableInOrder(stateRef.current, signedIn)) {
          // Each send is awaited, and on poor wifi each can take a full
          // timeout: the tablet may have locked, or changed hands, since the
          // pass began. Locked, nothing more goes — there is no token. Signed
          // in as somebody else, their commands wait for them, and so does
          // everything behind them (FT4 review B2).
          if (!enabledRef.current) break;
          if (isHeld(command, actorRef.current?.staffMemberId ?? null)) {
            blocked.add(command.scope);
            continue;
          }
          if (blocked.has(command.scope)) continue;

          const action: CommandAction = await sendCommand(command, {
            gateway,
            floor: floorRef.current,
            nowMs: () => Date.now(),
            onResult: (result) => onAppliedRef.current?.(result),
          });

          dispatch(action);
          if (action.type === 'deferred') blocked.add(command.scope);
          if (action.type === 'applied' || action.type === 'replayed') {
            onSettledRef.current?.(command);
            const sent = { command, atMs: Date.now() };
            setRecent((current) => [sent, ...current].slice(0, RECENT_KEPT));
          }

          if (action.type === 'conflicted') {
            const entry: ConflictEntry = {
              command,
              detectedAtMs: action.atMs,
              observed: action.observed,
              reason: action.reason,
            };
            // A race is settled by telling the waiter, not by adding a row to a
            // list they have to come back to. It is taken straight back out of
            // the conflict list, which is the one place an entry leaves without
            // a person choosing — and it leaves because a person is watching.
            if (isLiveRace(entry)) {
              dispatch({ type: 'discardConflict', id: command.id });
              onLiveRaceRef.current?.(entry);
            }
          }
        }
      } finally {
        running.current = false;
        dispatch({ type: 'syncFinished' });
        // A sync asked for mid-pass — new work, a reconnect, a new person —
        // would otherwise wait for the next change to the queue.
        if (again.current) {
          again.current = false;
          queueMicrotask(() => syncRef.current());
        }
      }
    })();
  }, [gateway]);

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // Replay whenever the connection returns or work appears. Both are the same
  // trigger — "there is something to send and a way to send it" — so they are
  // one effect rather than two that can disagree.
  // The person signed in is a trigger too: a command waiting for Narek goes
  // the moment Narek is back.
  useEffect(() => {
    if (!ready || !online || !enabled) return;
    if (state.queue.length === 0) return;
    sync();
  }, [ready, online, enabled, state.queue, actorId, sync]);

  // --- API ------------------------------------------------------------------

  const enqueue = useCallback((command: NewCommand): boolean => {
    if (!isQueueable(command.body.kind)) return false;
    // Whether the browser had a connection at the moment of the tap, captured
    // here and stored with the command: on reconnect it is the only thing that
    // distinguishes a command that waited from one sent as it was made.
    dispatch({
      type: 'enqueued',
      command,
      atMs: Date.now(),
      takenOffline: takenOfflineNow(),
      by: actorRef.current,
    });
    return true;
  }, []);

  const discard = useCallback((id: string) => {
    dispatch({ type: 'discardConflict', id });
  }, []);

  const applyAnyway = useCallback((id: string) => {
    dispatch({ type: 'retryConflict', id, atMs: Date.now(), by: actorRef.current });
  }, []);

  const claim = useCallback((id: string) => {
    const by = actorRef.current;
    if (by) dispatch({ type: 'claimed', id, by });
  }, []);

  const drop = useCallback((id: string) => {
    dispatch({ type: 'dropped', id });
  }, []);

  const held = useMemo(() => heldFor(state, actorId), [state, actorId]);

  // Computed from the current props and state rather than from the refs: this
  // one is read *during* render, and the refs are a commit behind by design.
  const projected = useCallback(
    (tableId: string) => projectedStatus(floor, state.queue, tableId),
    [floor, state.queue],
  );

  const overlay = useCallback(
    (source: StaffFloor | null) => (source ? optimisticFloor(source.plan, state.queue) : null),
    [state.queue],
  );

  return useMemo(
    () => ({
      state,
      pending: pendingCount(state),
      conflicts: conflictCount(state),
      held,
      recent,
      online,
      syncing: state.syncing,
      ready,
      enqueue,
      sync,
      discard,
      applyAnyway,
      claim,
      drop,
      projected,
      overlay,
    }),
    [
      state,
      held,
      recent,
      online,
      ready,
      enqueue,
      sync,
      discard,
      applyAnyway,
      claim,
      drop,
      projected,
      overlay,
    ],
  );
}

/** A fresh command id. One per user action, reused on every retry. */
export function commandId(): string {
  return newCommandId();
}

export type { QueuedCommand };
