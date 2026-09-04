import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';
import { type BackoffOptions, createRetryPolicy } from './backoff';
import type { ConnectionState } from './connectionState';

export type ConnectionStateListener = (state: ConnectionState) => void;
export type Unsubscribe = () => void;

export interface RealtimeConnectionConfig {
  /** Full hub url, e.g. `https://localhost:7188/hubs/floor`. */
  readonly url: string;
  /** Bearer token supplier; called on every (re)connect so a refreshed token is used. */
  readonly getToken?: (() => string | null | Promise<string | null>) | undefined;
  readonly backoff?: BackoffOptions | undefined;
  readonly logLevel?: LogLevel | undefined;
  /**
   * Builds the underlying connection. Swappable so tests and later tasks can
   * drive the state machine without a live hub.
   */
  readonly build?: ((config: RealtimeConnectionConfig) => HubConnection) | undefined;
}

function defaultBuild(config: RealtimeConnectionConfig): HubConnection {
  const { getToken } = config;

  return new HubConnectionBuilder()
    .withUrl(config.url, {
      // Spread rather than pass `undefined`: SignalR's options type requires the
      // key to be absent when there is no token, not present and undefined.
      ...(getToken ? { accessTokenFactory: async () => (await getToken()) ?? '' } : {}),
    })
    .withAutomaticReconnect(createRetryPolicy(config.backoff))
    .configureLogging(config.logLevel ?? LogLevel.Warning)
    .build();
}

/**
 * A SignalR hub connection with its state exposed as something renderable.
 *
 * Responsibilities kept deliberately narrow for this task: connect, reconnect
 * with backoff, join/leave groups, and publish state. Mapping hub events onto
 * query cache updates is a later task's job and belongs in the app, not here.
 */
export class RealtimeConnection {
  readonly #config: RealtimeConnectionConfig;
  readonly #listeners = new Set<ConnectionStateListener>();
  /** Groups we believe we are in, replayed after every reconnect. */
  readonly #groups = new Set<string>();

  #connection: HubConnection | null = null;
  #state: ConnectionState = 'idle';

  constructor(config: RealtimeConnectionConfig) {
    this.#config = config;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get groups(): readonly string[] {
    return [...this.#groups];
  }

  /** Subscribe to state changes. Fires immediately with the current state. */
  onStateChange(listener: ConnectionStateListener): Unsubscribe {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #setState(next: ConnectionState): void {
    if (this.#state === next) return;
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }

  /** Register a handler for a server-to-client hub method. */
  on<T>(method: string, handler: (payload: T) => void): Unsubscribe {
    const connection = this.#ensureConnection();
    const wrapped = (payload: T): void => {
      handler(payload);
    };
    connection.on(method, wrapped as (...args: unknown[]) => void);
    return () => {
      connection.off(method, wrapped as (...args: unknown[]) => void);
    };
  }

  #ensureConnection(): HubConnection {
    if (this.#connection) return this.#connection;

    const build = this.#config.build ?? defaultBuild;
    const connection = build(this.#config);

    connection.onreconnecting(() => {
      this.#setState('reconnecting');
    });

    connection.onreconnected(() => {
      this.#setState('connected');
      // SignalR reconnects the transport but the server has forgotten our group
      // memberships, so a reconnected client would sit silent while the floor
      // changes around it. Rejoining is what makes reconnection actually work.
      void this.#rejoinGroups();
    });

    connection.onclose(() => {
      this.#setState('disconnected');
    });

    this.#connection = connection;
    return connection;
  }

  async connect(): Promise<void> {
    const connection = this.#ensureConnection();
    if (connection.state === HubConnectionState.Connected) {
      this.#setState('connected');
      return;
    }

    this.#setState('connecting');
    try {
      await connection.start();
      this.#setState('connected');
      await this.#rejoinGroups();
    } catch (error) {
      this.#setState('disconnected');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.#connection;
    this.#connection = null;
    this.#groups.clear();
    this.#setState('idle');
    if (connection) await connection.stop();
  }

  /**
   * Join a hub group, e.g. one branch's floor.
   *
   * The group is remembered so it can be rejoined after a reconnect.
   */
  async subscribe(groupName: string): Promise<void> {
    this.#groups.add(groupName);
    const connection = this.#connection;
    if (connection?.state === HubConnectionState.Connected) {
      await connection.invoke('Subscribe', groupName);
    }
  }

  async unsubscribe(groupName: string): Promise<void> {
    this.#groups.delete(groupName);
    const connection = this.#connection;
    if (connection?.state === HubConnectionState.Connected) {
      await connection.invoke('Unsubscribe', groupName);
    }
  }

  async #rejoinGroups(): Promise<void> {
    const connection = this.#connection;
    if (!connection || connection.state !== HubConnectionState.Connected) return;
    for (const groupName of this.#groups) {
      await connection.invoke('Subscribe', groupName);
    }
  }
}

export function createRealtimeConnection(config: RealtimeConnectionConfig): RealtimeConnection {
  return new RealtimeConnection(config);
}
