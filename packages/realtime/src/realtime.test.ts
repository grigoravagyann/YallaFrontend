import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import { describe, expect, it, vi } from 'vitest';
import { nextDelayMs, createRetryPolicy } from './backoff';
import { RealtimeConnection } from './connection';
import { connectionStateKey, isLive, isStale, type ConnectionState } from './connectionState';
import { group } from './hubs';

/** Minimal stand-in for a HubConnection, driving the state machine by hand. */
function fakeHub() {
  const handlers = {
    reconnecting: [] as (() => void)[],
    reconnected: [] as (() => void)[],
    close: [] as (() => void)[],
  };
  const methods = new Map<string, Set<(...args: unknown[]) => void>>();

  const hub = {
    state: HubConnectionState.Disconnected,
    invoke: vi.fn(async () => undefined),
    start: vi.fn(async () => {
      hub.state = HubConnectionState.Connected;
    }),
    stop: vi.fn(async () => {
      hub.state = HubConnectionState.Disconnected;
    }),
    on: vi.fn((method: string, handler: (...args: unknown[]) => void) => {
      const set = methods.get(method) ?? new Set();
      set.add(handler);
      methods.set(method, set);
    }),
    off: vi.fn((method: string, handler: (...args: unknown[]) => void) => {
      methods.get(method)?.delete(handler);
    }),
    onreconnecting: vi.fn((h: () => void) => handlers.reconnecting.push(h)),
    onreconnected: vi.fn((h: () => void) => handlers.reconnected.push(h)),
    onclose: vi.fn((h: () => void) => handlers.close.push(h)),
  };

  return {
    hub: hub as unknown as HubConnection,
    raw: hub,
    emit: (method: string, payload: unknown) => {
      for (const handler of methods.get(method) ?? []) handler(payload);
    },
    fireReconnecting: () => handlers.reconnecting.forEach((h) => h()),
    fireReconnected: () => handlers.reconnected.forEach((h) => h()),
    fireClose: () => handlers.close.forEach((h) => h()),
  };
}

function connectionWith() {
  const f = fakeHub();
  const connection = new RealtimeConnection({
    url: 'https://localhost:7188/hubs/floor',
    build: () => f.hub,
  });
  return { connection, ...f };
}

describe('connection state', () => {
  it('starts idle', () => {
    const { connection } = connectionWith();
    expect(connection.state).toBe('idle');
  });

  it('moves idle -> connecting -> connected', async () => {
    const { connection } = connectionWith();
    const seen: ConnectionState[] = [];
    connection.onStateChange((state) => seen.push(state));

    await connection.connect();

    expect(seen).toEqual(['idle', 'connecting', 'connected']);
  });

  it('reports the current state immediately on subscribe', async () => {
    const { connection } = connectionWith();
    await connection.connect();

    const seen: ConnectionState[] = [];
    connection.onStateChange((state) => seen.push(state));
    expect(seen).toEqual(['connected']);
  });

  it('goes to reconnecting when the transport drops', async () => {
    const { connection, fireReconnecting } = connectionWith();
    await connection.connect();
    fireReconnecting();
    expect(connection.state).toBe('reconnecting');
  });

  it('returns to connected after a successful reconnect', async () => {
    const { connection, fireReconnecting, fireReconnected } = connectionWith();
    await connection.connect();
    fireReconnecting();
    fireReconnected();
    expect(connection.state).toBe('connected');
  });

  it('goes to disconnected when the connection closes for good', async () => {
    const { connection, fireClose } = connectionWith();
    await connection.connect();
    fireClose();
    expect(connection.state).toBe('disconnected');
  });

  it('reports disconnected when the first connect fails', async () => {
    const f = fakeHub();
    f.raw.start.mockRejectedValueOnce(new Error('no route to host'));
    const connection = new RealtimeConnection({ url: 'x', build: () => f.hub });

    await expect(connection.connect()).rejects.toThrow('no route to host');
    expect(connection.state).toBe('disconnected');
  });

  it('stops notifying after unsubscribe', async () => {
    const { connection } = connectionWith();
    const seen: ConnectionState[] = [];
    const off = connection.onStateChange((state) => seen.push(state));
    off();
    await connection.connect();
    expect(seen).toEqual(['idle']);
  });
});

describe('groups', () => {
  it('remembers a group joined before connecting and joins it on connect', async () => {
    const { connection, raw } = connectionWith();
    await connection.subscribe(group.branchFloor('7'));
    expect(raw.invoke).not.toHaveBeenCalled();

    await connection.connect();
    expect(raw.invoke).toHaveBeenCalledWith('Subscribe', 'branch:7:floor');
  });

  it('rejoins every group after a reconnect', async () => {
    // Without this the tablet reconnects and then sits silent while the floor
    // changes around it — the worst possible failure, because it looks fine.
    const { connection, raw, fireReconnecting, fireReconnected } = connectionWith();
    await connection.connect();
    await connection.subscribe(group.branchFloor('7'));
    await connection.subscribe(group.tab('abc'));
    raw.invoke.mockClear();

    fireReconnecting();
    fireReconnected();
    await vi.waitFor(() => {
      expect(raw.invoke).toHaveBeenCalledWith('Subscribe', 'branch:7:floor');
      expect(raw.invoke).toHaveBeenCalledWith('Subscribe', 'tab:abc');
    });
  });

  it('does not rejoin a group that was left', async () => {
    const { connection, raw, fireReconnected } = connectionWith();
    await connection.connect();
    await connection.subscribe(group.branchFloor('7'));
    await connection.unsubscribe(group.branchFloor('7'));
    raw.invoke.mockClear();

    fireReconnected();
    await vi.waitFor(() => expect(connection.state).toBe('connected'));
    expect(raw.invoke).not.toHaveBeenCalledWith('Subscribe', 'branch:7:floor');
  });

  it('clears groups and returns to idle on disconnect', async () => {
    const { connection } = connectionWith();
    await connection.connect();
    await connection.subscribe(group.branchFloor('7'));

    await connection.disconnect();

    expect(connection.groups).toEqual([]);
    expect(connection.state).toBe('idle');
  });
});

describe('hub event handlers', () => {
  it('delivers a payload to a registered handler', async () => {
    const { connection, emit } = connectionWith();
    const handler = vi.fn();
    connection.on('TableStateChanged', handler);

    emit('TableStateChanged', { tableId: '3', status: 'occupied' });

    expect(handler).toHaveBeenCalledWith({ tableId: '3', status: 'occupied' });
  });

  it('stops delivering after the returned unsubscribe is called', () => {
    const { connection, emit } = connectionWith();
    const handler = vi.fn();
    const off = connection.on('TabUpdated', handler);
    off();

    emit('TabUpdated', {});

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('group names', () => {
  it('are derived, not typed at each call site', () => {
    expect(group.branchFloor('7')).toBe('branch:7:floor');
    expect(group.tab('abc')).toBe('tab:abc');
  });
});

describe('backoff', () => {
  const noJitter = () => 0;

  it('grows exponentially from the initial delay', () => {
    const options = { initialDelayMs: 1000, maxDelayMs: 30_000 };
    expect(nextDelayMs(0, options, noJitter)).toBe(1000);
    expect(nextDelayMs(1, options, noJitter)).toBe(2000);
    expect(nextDelayMs(2, options, noJitter)).toBe(4000);
    expect(nextDelayMs(3, options, noJitter)).toBe(8000);
  });

  it('caps at the maximum delay', () => {
    const options = { initialDelayMs: 1000, maxDelayMs: 30_000 };
    expect(nextDelayMs(20, options, noJitter)).toBe(30_000);
  });

  it('adds jitter so a room full of devices does not retry in lockstep', () => {
    const options = { initialDelayMs: 1000, maxDelayMs: 30_000, jitterRatio: 0.25 };
    expect(nextDelayMs(0, options, () => 1)).toBe(1250);
    expect(nextDelayMs(0, options, () => 0.5)).toBe(1125);
  });

  it('never returns a negative or non-finite delay', () => {
    for (const attempt of [-5, 0, 1, 50]) {
      const delay = nextDelayMs(attempt, {}, () => 0.5);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
    }
  });

  describe('retry policy', () => {
    it('keeps retrying forever by default', () => {
      const policy = createRetryPolicy({ random: () => 0 });
      const delay = policy.nextRetryDelayInMilliseconds({
        previousRetryCount: 100,
        elapsedMilliseconds: 60 * 60_000,
        retryReason: new Error('drop'),
      });
      expect(delay).not.toBeNull();
    });

    it('gives up once maxElapsedMs passes', () => {
      const policy = createRetryPolicy({ maxElapsedMs: 10_000, random: () => 0 });
      expect(
        policy.nextRetryDelayInMilliseconds({
          previousRetryCount: 3,
          elapsedMilliseconds: 10_001,
          retryReason: new Error('drop'),
        }),
      ).toBeNull();
    });
  });
});

describe('connection state helpers', () => {
  it('only treats connected as live', () => {
    expect(isLive('connected')).toBe(true);
    for (const state of ['idle', 'connecting', 'reconnecting', 'disconnected'] as const) {
      expect(isLive(state)).toBe(false);
    }
  });

  it('treats reconnecting and disconnected as stale', () => {
    expect(isStale('reconnecting')).toBe(true);
    expect(isStale('disconnected')).toBe(true);
    // Nothing stale to warn about on a first load.
    expect(isStale('connecting')).toBe(false);
    expect(isStale('connected')).toBe(false);
  });

  it('maps every state to a translation key', () => {
    for (const state of [
      'idle',
      'connecting',
      'connected',
      'reconnecting',
      'disconnected',
    ] as const) {
      expect(connectionStateKey(state)).toMatch(/^connection\./u);
    }
  });
});
