/**
 * Keeping a mock world across a full page load.
 *
 * Every mock here is a closure over Maps, built fresh on import. That was fine
 * while a screen was a single React tree, and wrong the moment a flow crossed
 * a navigation the browser performs itself: the public page's "view or cancel
 * this booking" link, a diner's `/orders` tab opened by URL, the reset-password
 * link in a sign-in email. Each one is a reload, each reload was a new world,
 * and the booking made two taps ago was gone (QA F2, 2026-10-16).
 *
 * The world is kept as a **journal of the calls that changed it**, not as a
 * snapshot of its state. A snapshot would mean teaching every mock to serialise
 * every Map and to restore the ids it mints; a journal is replayed into a fresh
 * mock through the same methods the screens use, with the clock set to the
 * moment each call was made — so a code that was valid when it was entered is
 * valid again on replay, and a booking that was "two days out" when it was made
 * stays the booking it was. Ids are minted by the mock's own counters, which
 * the replay advances exactly as the original calls did, so a venue created
 * after a reload is `v-new-2`, never a second `v-new-1`.
 *
 * Only in a browser, and only when asked: a test that persisted its world
 * across cases would be the flakiest test in the repository.
 */

/** The slice of `Storage` the journal needs. `localStorage` satisfies it. */
export interface MockJournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface JournalEntry {
  /** When the call was made, so replay can run the mock's clock at that moment. */
  readonly at: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

interface Journal {
  readonly v: 1;
  /** The seed the world's code generator drew, handed back so replay mints the same codes. */
  readonly seed: number;
  readonly entries: readonly JournalEntry[];
}

export interface PersistedMockOptions<G extends object> {
  /** The storage key. One world per key; two gateways sharing a key would replay each other. */
  readonly key: string;
  /** Where the journal lives. `null` (or absent) keeps the world in memory only. */
  readonly storage?: MockJournalStorage | null | undefined;
  /**
   * Builds the mock. Called once, with the clock the replay drives and a
   * latency of zero — the wrapper applies the latency itself, after replay,
   * so a journal of two hundred calls does not take a minute to come back.
   */
  readonly create: (inner: {
    readonly now: () => Date;
    readonly latencyMs: 0;
    readonly codeSeed: number;
  }) => G;
  /** Simulated latency, applied to every call once the world is back. */
  readonly latencyMs?: number | undefined;
  /** Per-method latency multipliers, e.g. `{ getMenuReport: 3 }`. */
  readonly slow?: Readonly<Record<string, number>> | undefined;
  /**
   * Which calls change the world and so belong in the journal. The default
   * takes every method whose name does not start with a read verb.
   */
  readonly isMutation?: ((method: string) => boolean) | undefined;
  /** The wall clock, for recording `at`. Tests pass a frozen one. */
  readonly now?: (() => Date) | undefined;
  /** The seed to use when the storage has no journal yet. Random when absent. */
  readonly seed?: number | undefined;
}

export interface PersistedMock {
  /** Resolved once the journal has been replayed. Every call waits for it. */
  readonly ready: Promise<void>;
  /** How many calls the journal holds. For the dev banner and the tests. */
  journalLength(): number;
}

const READ_VERBS = /^(get|list|search|resolve|export|is|has|find|read|peek|subscribe)/u;

/** The default rule: everything that is not a read is a write. */
export function isMutatingMethod(method: string): boolean {
  return !READ_VERBS.test(method);
}

/**
 * Arguments as JSON can carry them. A `File` or a `Blob` becomes its size and
 * name, which is all any mock reads of one; a function (an `onProgress`) is
 * dropped, which every mock treats as optional.
 */
function serialisable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (typeof Blob !== 'undefined' && item instanceof Blob) {
        return {
          __mockFile: true,
          size: item.size,
          type: item.type,
          name: 'name' in item && typeof item.name === 'string' ? item.name : 'upload',
        };
      }
      return item;
    }) ?? 'null',
  );
}

function readJournal(storage: MockJournalStorage | null, key: string): Journal | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Journal).v === 1 &&
      typeof (parsed as Journal).seed === 'number' &&
      Array.isArray((parsed as Journal).entries)
    ) {
      return parsed as Journal;
    }
  } catch {
    // A private window, blocked site data, or a journal from another version:
    // start fresh rather than render nothing.
  }
  return null;
}

function writeJournal(storage: MockJournalStorage | null, key: string, journal: Journal): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(journal));
  } catch {
    // Quota or a blocked store: the world stays in memory for this load.
  }
}

/** Forget a world. The next load starts from the fixture. */
export function clearMockJournal(storage: MockJournalStorage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to forget, or nowhere to forget it from.
  }
}

/** Every journal key an app writes starts with this, so one action can forget them all. */
export const MOCK_JOURNAL_PREFIX = 'yalla.mock.';

/**
 * Forget every mock world this browser holds. The "reset mock data" dev action:
 * the caller reloads the page afterwards, and every gateway starts from the
 * fixture. Returns how many worlds were forgotten.
 */
export function resetBrowserMockWorlds(): number {
  const storage = browserMockStorage();
  if (!storage) return 0;
  const keys: string[] = [];
  try {
    const local = window.localStorage;
    for (let index = 0; index < local.length; index += 1) {
      const key = local.key(index);
      if (key?.startsWith(MOCK_JOURNAL_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }
  for (const key of keys) clearMockJournal(storage, key);
  return keys.length;
}

/**
 * `window.localStorage` when this is a browser that lets us read it, else null.
 *
 * Wrapped because a private window, or a browser with site data blocked,
 * throws on the *access* rather than returning null.
 */
export function browserMockStorage(): MockJournalStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/**
 * Wrap a mock so its world survives a reload.
 *
 * Returns the same shape as the mock, plus {@link PersistedMock}. Every method
 * waits for the replay, then for the latency, then runs; a mutation that
 * succeeded is appended to the journal. A call that fails is not recorded,
 * because it changed nothing.
 */
export function persistMockGateway<G extends object>(
  options: PersistedMockOptions<G>,
): G & PersistedMock {
  const storage = options.storage ?? null;
  const latency = options.latencyMs ?? 0;
  const slow = options.slow ?? {};
  const isMutation = options.isMutation ?? isMutatingMethod;
  const wallClock = options.now ?? (() => new Date());

  const stored = readJournal(storage, options.key);
  const seed = stored?.seed ?? options.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const entries: JournalEntry[] = stored ? [...stored.entries] : [];

  // While replaying, the mock's clock is the moment the recorded call was made.
  let replayAt: Date | null = null;
  const inner = options.create({
    now: () => replayAt ?? wallClock(),
    latencyMs: 0,
    codeSeed: seed,
  });

  const methods = inner as unknown as Record<string, unknown>;

  const ready: Promise<void> = (async () => {
    for (const entry of entries) {
      const method = methods[entry.method];
      if (typeof method !== 'function') continue;
      replayAt = new Date(entry.at);
      try {
        await (method as (...args: unknown[]) => Promise<unknown>).apply(inner, [...entry.args]);
      } catch {
        // The world refused it this time — a code that expired between the
        // recording and the replay, say. What followed may fail too, and that
        // is still a better world than none.
      }
    }
    replayAt = null;
  })();

  const wait = (multiplier: number) =>
    latency > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, latency * multiplier))
      : Promise.resolve();

  const wrapped: Record<string, unknown> = {
    ready,
    journalLength: () => entries.length,
  };

  for (const name of Object.keys(methods)) {
    const method = methods[name];
    if (typeof method !== 'function') {
      wrapped[name] = method;
      continue;
    }
    wrapped[name] = async (...args: unknown[]) => {
      await ready;
      await wait(slow[name] ?? 1);
      const result: unknown = await (method as (...a: unknown[]) => unknown).apply(inner, args);
      if (isMutation(name)) {
        entries.push({ at: wallClock().toISOString(), method: name, args: serialisable(args) as unknown[] });
        writeJournal(storage, options.key, { v: 1, seed, entries });
      }
      return result;
    };
  }

  return wrapped as G & PersistedMock;
}
