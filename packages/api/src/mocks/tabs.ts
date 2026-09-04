import type { FloorTable } from '@yalla/floorplan/types';
import {
  NotTabHostError,
  TabClosedError,
  TableOutOfServiceError,
  UnknownTableCodeError,
} from '../contracts/errors';
import {
  DEFAULT_TAB_PERMISSIONS,
  HOST_TAB_PERMISSIONS,
  normalizeTabPermissions,
} from '../contracts/permissions';
import type {
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabParticipant,
  TabPermissions,
  TableTab,
  WaiterCall,
  WaiterCallReason,
} from '../contracts/tab';
import { mockTableCode, normalizeTableCode } from './tableCodes';

const URL_TAG = 'mock://yalla';

/**
 * The one participant this device is.
 *
 * A real backend issues an opaque device token on first contact and the id is
 * whatever comes back. There is no account behind it, which is the whole point:
 * someone who walked in off the street is a participant for as long as the tab
 * is open, and nothing more.
 */
export const DEVICE_PARTICIPANT_ID = 'p-you';

/** Invite links are short-lived: a link in a group chat outlives the meal. */
const INVITE_TTL_MS = 30 * 60_000;

/**
 * How long after opening a tab the mock lets a guest turn up and ask to join.
 *
 * Simulated, and the only invented activity in this mock. Without it the host
 * controls screen has nothing to approve on a single device, and approve,
 * reject and the permission toggles cannot be walked at all.
 */
const GUEST_ARRIVES_AFTER_MS = 6_000;

/** Where a scanned table code resolves to. Supplied by the mock gateway. */
export interface TableLocation {
  readonly venueId: string;
  readonly venueName: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly timeZoneId: string;
  readonly table: FloorTable;
}

interface MutableParticipant {
  id: string;
  displayName: string | null;
  role: 'host' | 'guest';
  status: TabParticipant['status'];
  joinedAtUtc: string;
  permissions: TabPermissions;
}

interface TabRecord {
  id: string;
  status: 'open' | 'closed';
  location: TableLocation;
  openedAt: number;
  closedAtUtc: string | null;
  participants: MutableParticipant[];
  defaultPermissions: TabPermissions;
  /** Guard so the simulated joiner turns up exactly once. */
  simulatedGuestArrived: boolean;
}

export interface TabWorldOptions {
  readonly now: () => Date;
  /** Resolve a table id to its venue, branch and current floor state. */
  readonly locate: (tableId: string) => TableLocation | null;
  /** Every table in the mock, for resolving a printed code back to a table. */
  readonly allTableIds: () => readonly string[];
  /**
   * Let a guest turn up on a tab you host, so approve and reject can be
   * exercised from one device. Off in tests that do not want the surprise.
   */
  readonly simulateJoiners?: boolean;
}

/**
 * Everything about tabs that the mock backend owns.
 *
 * Kept out of the gateway module because it is a self-contained little world
 * with its own invariants — who hosts, who is pending, what a replayed command
 * means — and those are easier to reason about and test on their own.
 */
export function createTabWorld(options: TabWorldOptions) {
  const { now, locate, allTableIds } = options;
  const simulateJoiners = options.simulateJoiners ?? true;

  const tabs = new Map<string, TabRecord>();
  /** tableId -> tabId, for the current tab on a table, open or just closed. */
  const tabByTable = new Map<string, string>();
  const invites = new Map<string, TabInvite>();
  /** commandId -> tabId. What makes a double scan open one tab, not two. */
  const commandLog = new Map<string, string>();
  /** commandId -> invite token, so a double tap on refresh does not churn it. */
  const inviteCommandLog = new Map<string, string>();
  const waiterCalls: WaiterCall[] = [];

  let sequence = 0;
  let seeded = false;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}_${sequence}`;
  }

  function participant(
    id: string,
    displayName: string | null,
    role: 'host' | 'guest',
    status: TabParticipant['status'],
    permissions: TabPermissions,
  ): MutableParticipant {
    return { id, displayName, role, status, joinedAtUtc: now().toISOString(), permissions };
  }

  function openEmptyRecord(location: TableLocation): TabRecord {
    const record: TabRecord = {
      id: nextId('tab'),
      status: 'open',
      location,
      openedAt: now().getTime(),
      closedAtUtc: null,
      participants: [],
      defaultPermissions: DEFAULT_TAB_PERMISSIONS,
      simulatedGuestArrived: false,
    };
    tabs.set(record.id, record);
    tabByTable.set(location.table.id, record.id);
    return record;
  }

  /**
   * Two fixtures, because two of the five scan outcomes are otherwise
   * unreachable from a single phone: a tab someone else already hosts, and a
   * table whose tab has been closed and paid.
   */
  function seed(): void {
    if (seeded) return;
    seeded = true;

    const busy = locate('b-lumen-north-t9');
    if (busy) {
      const record = openEmptyRecord(busy);
      record.participants.push(
        participant('p-aram', 'Aram', 'host', 'active', HOST_TAB_PERMISSIONS),
        participant('p-nare', 'Nare', 'guest', 'active', DEFAULT_TAB_PERMISSIONS),
        // No name. Still on the list — a guest nobody can see is how a party of
        // five turns into a disputed bill.
        participant('p-guest-1', null, 'guest', 'active', DEFAULT_TAB_PERMISSIONS),
      );
    }

    const finished = locate('b-greenbean-main-t16');
    if (finished) {
      const record = openEmptyRecord(finished);
      record.participants.push(
        participant('p-tigran', 'Tigran', 'host', 'active', HOST_TAB_PERMISSIONS),
      );
      record.status = 'closed';
      record.closedAtUtc = now().toISOString();
    }
  }

  function findTableIdByCode(code: string): string | null {
    const wanted = normalizeTableCode(code);
    if (!wanted) return null;
    return allTableIds().find((id) => mockTableCode(id) === wanted) ?? null;
  }

  function findTabByInviteToken(token: string): TabRecord | null {
    for (const invite of invites.values()) {
      if (invite.token === token) return tabs.get(invite.tabId) ?? null;
    }
    return null;
  }

  /** Let the simulated joiner turn up, if it is time and this is your tab. */
  function tick(record: TabRecord): void {
    if (!simulateJoiners || record.simulatedGuestArrived || record.status !== 'open') return;
    const you = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);
    if (!you || you.role !== 'host') return;
    if (now().getTime() - record.openedAt < GUEST_ARRIVES_AFTER_MS) return;

    record.simulatedGuestArrived = true;
    record.participants.push(
      participant('p-sona', 'Sona', 'guest', 'pending', record.defaultPermissions),
    );
  }

  function project(record: TabRecord): TableTab {
    const you = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);

    return {
      id: record.id,
      status: record.status,
      venueId: record.location.venueId,
      venueName: record.location.venueName,
      branchId: record.location.branchId,
      branchName: record.location.branchName,
      timeZoneId: record.location.timeZoneId,
      tableId: record.location.table.id,
      tableLabel: record.location.table.label,
      floorAreaName: record.location.table.floorAreaName,
      openedAtUtc: new Date(record.openedAt).toISOString(),
      closedAtUtc: record.closedAtUtc,
      participants: record.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        role: p.role,
        status: p.status,
        isYou: p.id === DEVICE_PARTICIPANT_ID,
        joinedAtUtc: p.joinedAtUtc,
        permissions: p.permissions,
      })),
      yourParticipantId: you?.id ?? DEVICE_PARTICIPANT_ID,
      yourRole: you?.role ?? 'guest',
      yourStatus: you?.status ?? 'left',
      yourPermissions: you?.permissions ?? DEFAULT_TAB_PERMISSIONS,
      defaultPermissions: record.defaultPermissions,
    };
  }

  function requireHost(record: TabRecord): void {
    const you = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);
    if (!you || you.role !== 'host' || you.status !== 'active') {
      throw new NotTabHostError({ url: URL_TAG });
    }
  }

  function requireTab(tabId: string): TabRecord {
    const record = tabs.get(tabId);
    if (!record) throw new UnknownTableCodeError({ url: URL_TAG });
    return record;
  }

  function mutateParticipant(
    tabId: string,
    participantId: string,
    commandId: string,
    apply: (target: MutableParticipant, record: TabRecord) => void,
  ): TableTab {
    const record = requireTab(tabId);
    requireHost(record);

    // Replaying a host action must be a no-op rather than a second one:
    // approving twice after a dropped response must not un-reject anybody.
    if (commandLog.has(commandId)) return project(record);
    commandLog.set(commandId, tabId);

    const target = record.participants.find((p) => p.id === participantId);
    if (target) apply(target, record);
    return project(record);
  }

  /**
   * Find, or create, the tab a table code points at.
   *
   * Throws the three scan failures, so `scan` reads as one straight line.
   */
  function resolveByTableCode(code: string): TabRecord {
    const tableId = findTableIdByCode(code);
    if (!tableId) throw new UnknownTableCodeError({ url: URL_TAG });

    const location = locate(tableId);
    if (!location) throw new UnknownTableCodeError({ url: URL_TAG });

    if (location.table.state === 'outOfService') {
      throw new TableOutOfServiceError({ url: URL_TAG, tableLabel: location.table.label });
    }

    const existingId = tabByTable.get(tableId);
    const existing = existingId ? tabs.get(existingId) : undefined;
    // No tab on this table yet: whoever scanned first opens one and hosts it.
    return existing ?? openEmptyRecord(location);
  }

  return {
    scan(command: ScanTableCommand): ScanResult {
      seed();

      const replayed = commandLog.get(command.commandId);
      if (replayed) {
        const record = tabs.get(replayed);
        if (record) {
          const you = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);
          return {
            kind: you?.status === 'pending' ? 'joinPending' : 'alreadyOn',
            tab: project(record),
          };
        }
      }

      // An invite token and a table code arrive through the same door: the
      // client does not know which it is holding, and must not have to.
      const record =
        findTabByInviteToken(command.tableCode) ?? resolveByTableCode(command.tableCode);

      if (record.status === 'closed') {
        throw new TabClosedError({ url: URL_TAG, tabId: record.id });
      }

      commandLog.set(command.commandId, record.id);

      const existing = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);
      if (existing && (existing.status === 'active' || existing.status === 'pending')) {
        return {
          kind: existing.status === 'pending' ? 'joinPending' : 'alreadyOn',
          tab: project(record),
        };
      }

      const isFirst = record.participants.every((p) => p.status !== 'active');
      const you = participant(
        DEVICE_PARTICIPANT_ID,
        command.displayName ?? null,
        isFirst ? 'host' : 'guest',
        isFirst ? 'active' : 'pending',
        isFirst ? HOST_TAB_PERMISSIONS : record.defaultPermissions,
      );

      if (existing) {
        // Rejoining after leaving or being removed: the same seat, reset.
        Object.assign(existing, you);
      } else {
        record.participants.push(you);
      }

      return { kind: isFirst ? 'tabOpened' : 'joinPending', tab: project(record) };
    },

    get(tabId: string): TableTab | null {
      seed();
      const record = tabs.get(tabId);
      if (!record) return null;
      tick(record);
      return project(record);
    },

    leave(tabId: string): void {
      const record = tabs.get(tabId);
      if (!record) return;
      const you = record.participants.find((p) => p.id === DEVICE_PARTICIPANT_ID);
      if (!you) return;

      const wasHost = you.role === 'host';
      you.status = 'left';
      you.role = 'guest';
      if (!wasHost) return;

      // Somebody has to be able to approve joiners. The earliest-joined active
      // participant inherits, and a tab with nobody left simply closes.
      const heir = record.participants.find((p) => p.status === 'active');
      if (heir) {
        heir.role = 'host';
        heir.permissions = HOST_TAB_PERMISSIONS;
      } else {
        record.status = 'closed';
        record.closedAtUtc = now().toISOString();
      }
    },

    invite(input: { tabId: string; commandId: string }): TabInvite {
      const record = requireTab(input.tabId);

      const replayedToken = inviteCommandLog.get(input.commandId);
      const current = invites.get(record.id);
      if (replayedToken && current && current.token === replayedToken) return current;

      const token = nextId('inv');
      const invite: TabInvite = {
        tabId: record.id,
        token,
        // https, not the custom scheme: a link that opens a web page when the
        // app is missing is the difference between an awkward moment and a dead
        // end at the table.
        url: `https://yalla.am/join/${token}`,
        expiresAtUtc: new Date(now().getTime() + INVITE_TTL_MS).toISOString(),
      };
      invites.set(record.id, invite);
      inviteCommandLog.set(input.commandId, token);
      return invite;
    },

    approve(input: { tabId: string; participantId: string; commandId: string }): TableTab {
      return mutateParticipant(
        input.tabId,
        input.participantId,
        input.commandId,
        (target, record) => {
          if (target.status !== 'pending') return;
          target.status = 'active';
          target.permissions = normalizeTabPermissions(record.defaultPermissions);
        },
      );
    },

    reject(input: { tabId: string; participantId: string; commandId: string }): TableTab {
      return mutateParticipant(input.tabId, input.participantId, input.commandId, (target) => {
        if (target.status === 'pending') target.status = 'rejected';
      });
    },

    remove(input: { tabId: string; participantId: string; commandId: string }): TableTab {
      return mutateParticipant(input.tabId, input.participantId, input.commandId, (target) => {
        if (target.role === 'host') return; // The host cannot remove themselves.
        target.status = 'removed';
      });
    },

    setPermissions(input: {
      tabId: string;
      participantId: string;
      permissions: TabPermissions;
      commandId: string;
    }): TableTab {
      return mutateParticipant(input.tabId, input.participantId, input.commandId, (target) => {
        // The server is the last line on the invariant, exactly as the real one
        // will be: a client that sends pay-without-total gets it corrected, not
        // silently honoured.
        target.permissions = normalizeTabPermissions(input.permissions);
      });
    },

    setDefaults(input: {
      tabId: string;
      permissions: TabPermissions;
      commandId: string;
    }): TableTab {
      const record = requireTab(input.tabId);
      requireHost(record);
      if (commandLog.has(input.commandId)) return project(record);
      commandLog.set(input.commandId, record.id);

      record.defaultPermissions = normalizeTabPermissions(input.permissions);
      return project(record);
    },

    call(input: { tabId: string; reason: WaiterCallReason; commandId: string }): WaiterCall {
      const record = requireTab(input.tabId);

      const existing = waiterCalls.find((c) => c.id === input.commandId);
      if (existing) return existing;

      const call: WaiterCall = {
        id: input.commandId,
        tabId: record.id,
        reason: input.reason,
        requestedAtUtc: now().toISOString(),
      };
      waiterCalls.push(call);
      return call;
    },

    /** For tests: every call raised so far, newest last. */
    calls(): readonly WaiterCall[] {
      return waiterCalls;
    },
  };
}

export type TabWorld = ReturnType<typeof createTabWorld>;
