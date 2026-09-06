import type { DerivedTableState, FloorPlanData, FloorTable } from '@yalla/floorplan/types';
import type {
  AvailabilityWindowDto,
  Booking,
  BookingStatus,
  BranchPolicy,
  CreateBookingCommand,
  PhoneChallenge,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
  VenueSummary,
  VerifiedPhone,
} from '../contracts/booking';
import type { ExtendHoldOutcome, ReservationState } from '../contracts/push';
import {
  ExpiredCodeError,
  HoldAlreadyExtendedError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../contracts/errors';
import type { Menu } from '../contracts/menu';
import type {
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabPermissions,
  TableTab,
  WaiterCall,
  WaiterCallReason,
} from '../contracts/tab';
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderResult,
  TabEventPage,
  TabShares,
} from '../contracts/ordering';
import { NotTabHostError } from '../contracts/errors';
import { NotFoundError } from '../errors';
import type { YallaGateway } from '../gateway';
import { mockMenuFor } from './menu';
import { createTabWorld, type TableLocation } from './tabs';
import { createTabOrders } from './tabOrders';
import { mockBranchMenu, publishedBranchMenu, mockMenuItem } from './menuDetail';
import { BOOKING_WINDOW_DAYS } from './publicMock';
import { mockVenues, type Branch as MockBranch } from './venues';

const URL_TAG = 'mock://yalla';

const DEFAULT_POLICY: BranchPolicy = {
  turnMinutes: 90,
  leadTimeMinutes: 15,
  instantConfirmationMaxPartySize: 6,
  freeCancellationMinutes: 120,
};

const MAX_CODE_ATTEMPTS = 3;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_CODES_PER_NUMBER = 5;

/** The fixed code the mock accepts, so the flow is testable without SMS. */
const MOCK_CODE = '123456';

interface Challenge {
  id: string;
  phoneE164: string;
  code: string;
  expiresAt: number;
  resendAt: number;
  attempts: number;
  burned: boolean;
}

export interface MockGatewayOptions {
  /** Injectable clock so tests are deterministic. */
  readonly now?: () => Date;
  /** Simulated latency in ms, so loading states are visible in the harness. */
  readonly latencyMs?: number;
  /**
   * Force the next `createBooking` to lose the race, for exercising the 409
   * path without needing a second device.
   */
  readonly simulateTableTaken?: boolean;
  /**
   * Let a guest turn up on a tab you host a few seconds after you open it, so
   * the host controls have something to approve on a single device.
   */
  readonly simulateJoiners?: boolean;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** Six digits, no leading-zero loss. */
function reservationCode(seed: number): string {
  return String(100000 + ((seed * 7919) % 900000));
}

export function createMockGateway(options: MockGatewayOptions = {}): YallaGateway {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;

  // Mutable in-memory state. A real backend owns all of this.
  const floors = new Map<string, FloorPlanData>();
  const bookings = new Map<string, Booking>();
  /** pushToken -> deviceId. Idempotent on the token, as the server is. */
  const pushDevices = new Map<string, string>();
  /** reservationId -> the one extension it is allowed, and what claimed it. */
  const holdExtensions = new Map<
    string,
    { readonly clientCommandId: string; readonly outcome: ExtendHoldOutcome }
  >();

  /**
   * A booking narrowed to what the wire actually carries.
   *
   * The mock holds the richer `Booking`; `ReservationView` has six fewer fields
   * (see `contracts/push.ts`). Narrowing here rather than returning the whole
   * thing keeps the mock honest about what a real notification landing can read.
   */
  function toReservationState(booking: Booking): ReservationState {
    const status: ReservationState['status'] =
      booking.status === 'cancelled'
        ? 'cancelledByDiner'
        : booking.status === 'pendingApproval'
          ? 'pendingApproval'
          : booking.status === 'confirmed'
            ? 'confirmed'
            : 'unknown';

    return {
      reservationId: booking.id,
      code: booking.code,
      status,
      branchId: booking.branchId,
      branchName: booking.branchName,
      tableLabel: booking.tableLabel,
      partySize: booking.partySize,
      startUtc: booking.slotUtc,
      // `AvailabilityWindowDto.untilUtc` is nullable — the window is unbounded
      // when nothing is booked after. The wire's `endUtc` is always set (start
      // plus the branch's turn time), so fall back to the slot itself rather
      // than emitting an empty string.
      endUtc: booking.window.untilUtc ?? booking.slotUtc,
      localDate: booking.slotUtc.slice(0, 10),
      localStartTime: booking.slotUtc.slice(11, 16),
      timeZoneId: booking.timeZoneId,
      cancelledAtUtc: booking.cancelledAtUtc,
      cancelledAfterDeadline:
        booking.cancelledAtUtc !== null &&
        Date.parse(booking.cancelledAtUtc) > Date.parse(booking.freeCancellationUntilUtc),
    };
  }
  const challenges = new Map<string, Challenge>();
  const codesPerNumber = new Map<string, number[]>();
  /** commandId -> bookingId. This is what makes createBooking idempotent. */
  const commandLog = new Map<string, string>();
  let simulateTakenOnce = options.simulateTableTaken ?? false;
  let sequence = 1;

  for (const venue of mockVenues) {
    for (const branch of venue.branches) {
      floors.set(branch.id, structuredClone(branch.floor));
    }
  }

  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

  /**
   * The tab side of the mock backend, sharing this instance's floors so a table
   * taken out of service is out of service for scanning too.
   */
  /** Which kind of place a branch is, for picking its menu. */
  const venueTypeFor = (branchId: string): 'cafe' | 'restaurant' | undefined =>
    mockVenues.find((venue) => venue.branches.some((branch) => branch.id === branchId))?.type;

  /**
   * Ordering and the bill, beside the tab world rather than inside it.
   *
   * One instance, shared by every screen this gateway serves, so a diner and a
   * waiter reading the same tab read the same lines and the same total.
   */
  const orders = createTabOrders({
    now: () => new Date(),
    menuItem: (branchId, itemId) => {
      const type = venueTypeFor(branchId);
      return type ? mockMenuItem(branchId, type, itemId) : undefined;
    },
    branchMenu: (branchId) => {
      const type = venueTypeFor(branchId);
      return type ? mockBranchMenu(branchId, type) : null;
    },
  });

  const world = createTabWorld({
    now,
    simulateJoiners: options.simulateJoiners ?? true,
    allTableIds: () => [...floors.values()].flatMap((floor) => floor.tables.map((t) => t.id)),
    locate: (tableId): TableLocation | null => {
      for (const venue of mockVenues) {
        for (const branch of venue.branches) {
          const table = floors.get(branch.id)?.tables.find((t) => t.id === tableId);
          if (!table) continue;
          return {
            venueId: venue.id,
            venueName: venue.name,
            branchId: branch.id,
            branchName: branch.name,
            timeZoneId: branch.timeZoneId,
            table,
          };
        }
      }
      return null;
    },
  });

  function findBranch(branchId: string): { venue: VenueSummary; branch: MockBranch } | null {
    for (const venue of mockVenues) {
      const branch = venue.branches.find((b) => b.id === branchId);
      if (branch) return { venue: toVenueSummary(venue), branch };
    }
    return null;
  }

  function toVenueSummary(venue: (typeof mockVenues)[number]): VenueSummary {
    return {
      id: venue.id,
      name: venue.name,
      type: venue.type,
      branches: venue.branches.map((b) => ({
        id: b.id,
        venueId: venue.id,
        venueName: venue.name,
        name: b.name,
        distanceKm: b.distanceKm,
        timeZoneId: b.timeZoneId,
        opensAtUtc: b.opensAtUtc,
        closesAtUtc: b.closesAtUtc,
        totalTables: b.totalTables,
        freeTables:
          floors.get(b.id)?.tables.filter((t) => t.state === 'free').length ?? b.freeTables,
        policy: DEFAULT_POLICY,
      })),
    };
  }

  /** Derive the window for one table at a slot. */
  function windowFor(
    table: FloorTable,
    slotUtc: string,
    policy: BranchPolicy,
  ): AvailabilityWindowDto {
    // Only a booking that starts *after* the requested slot bounds it. One
    // earlier in the day is behind the diner and bounds nothing.
    const next =
      table.nextReservationStartUtc && new Date(table.nextReservationStartUtc) > new Date(slotUtc)
        ? table.nextReservationStartUtc
        : null;
    if (!next) {
      // No later booking. This is a real advantage and the UI says so.
      return {
        fromUtc: slotUtc,
        untilUtc: null,
        nextBookingStartUtc: null,
        minutes: null,
        isShorterThanTurnTime: false,
      };
    }
    const minutes = minutesBetween(new Date(slotUtc), new Date(next));
    return {
      fromUtc: slotUtc,
      untilUtc: next,
      nextBookingStartUtc: next,
      minutes,
      isShorterThanTurnTime: minutes < policy.turnMinutes,
    };
  }

  /*
   * How far ahead a slot can be and still have the *physical* state of the room
   * in its answer.
   *
   * The backend's rule, mirrored: beyond a few minutes out, "somebody is
   * sitting there" tells you nothing about the slot — they will have finished
   * and gone — so physical status is dropped entirely and only bookings decide.
   * Keeping it is what made a table occupied by tonight's walk-ins render
   * unavailable for a booking three days away.
   */
  const PHYSICAL_HORIZON_MINUTES = 20;

  /** Does the requested sitting collide with the one already booked here? */
  function collidesWithBooking(table: FloorTable, slot: Date, policy: BranchPolicy): boolean {
    const next = table.nextReservationStartUtc;
    if (!next) return false;

    const booked = new Date(next);
    const requestedEnd = new Date(slot.getTime() + policy.turnMinutes * 60_000);
    const bookedEnd = new Date(booked.getTime() + policy.turnMinutes * 60_000);

    // Overlap in either direction, which is what makes "free now, booked at
    // 20:00" refuse a 20:00 request and allow a 15:00 one.
    return slot < bookedEnd && booked < requestedEnd;
  }

  /**
   * The table's state **at the requested slot**, not now.
   *
   * The single most important line in this mock. It used to return `table.state`
   * unchanged for every slot, which meant the fixtures answered "now" however
   * far ahead the question was — so the defect the diner surfaces had was
   * faithfully reproduced by the doubles that were supposed to catch it, and
   * five prompts of tests passed over it.
   */
  function stateAt(table: FloorTable, slot: Date, policy: BranchPolicy): DerivedTableState {
    // Not a session. A table taken out of service stays out of service.
    if (table.state === 'outOfService') return 'outOfService';

    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut <= PHYSICAL_HORIZON_MINUTES) {
      if (table.state === 'occupied' || table.state === 'held') return table.state;
    }

    return collidesWithBooking(table, slot, policy) ? 'reservedSoon' : 'free';
  }

  /**
   * A rule that refuses the whole request, before any table is considered.
   *
   * Reported once rather than on forty tables, and it is what a surface shows
   * instead of an empty room when somebody picks a slot that has already
   * happened.
   */
  function branchRejection(slot: Date, policy: BranchPolicy): TableUnavailableReason | null {
    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut < policy.leadTimeMinutes) return 'pastLeadTime';
    if (minutesOut > BOOKING_WINDOW_DAYS * 24 * 60) return 'tooFarAhead';
    return null;
  }

  function reasonFor(
    table: FloorTable,
    state: DerivedTableState,
    partySize: number,
  ): TableUnavailableReason | null {
    if (!table.isBookable) return 'notBookable';
    if (state === 'outOfService') return 'outOfService';
    if (state === 'held') return 'held';
    // Physically occupied, which only survives projection near enough to now.
    if (state === 'occupied') return 'occupied';
    // Empty at this moment and spoken for at the one asked about. A different
    // sentence, and a different next step: pick another time, not another table.
    if (state === 'reservedSoon') return 'alreadyBooked';
    if (table.seats < partySize) return 'tooSmall';
    return null;
  }

  function availabilityFor(
    branchId: string,
    slotUtc: string,
    partySize: number,
  ): readonly TableAvailability[] {
    const found = findBranch(branchId);
    const floor = floors.get(branchId);
    if (!found || !floor) return [];
    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const rejection = branchRejection(slot, policy);

    const freeCancellationUntilUtc = new Date(
      slot.getTime() - policy.freeCancellationMinutes * 60_000,
    ).toISOString();

    return floor.tables.map((table) => {
      const state = stateAt(table, slot, policy);
      // A branch-level refusal applies to every table and outranks whatever the
      // table itself would have said.
      const reason = rejection ?? reasonFor(table, state, partySize);
      return {
        tableId: table.id,
        tableLabel: table.label,
        floorAreaName: table.floorAreaName,
        seats: table.seats,
        isBookable: reason === null,
        unavailableReason: reason,
        window: reason === null ? windowFor(table, slotUtc, policy) : null,
        freeCancellationUntilUtc,
        requiresApproval: partySize > policy.instantConfirmationMaxPartySize,
      };
    });
  }

  /** The room as it will be at the slot, drawn from the same projection. */
  function slotFloorFor(branchId: string, slotUtc: string, partySize: number): SlotFloor | null {
    const floor = floors.get(branchId);
    if (!floor) return null;

    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const tables = availabilityFor(branchId, slotUtc, partySize);
    const answers = new Map(tables.map((table) => [table.tableId, table]));

    return {
      plan: {
        ...floor,
        tables: floor.tables.map((table) => ({
          ...table,
          state: stateAt(table, slot, policy),
          // The server's decision for this slot and party, not the table's
          // standing configuration — so the drawn room and the sheet agree.
          isBookable: answers.get(table.id)?.isBookable ?? false,
        })),
      },
      tables,
      rejection: branchRejection(slot, policy),
      slotUtc,
      partySize,
    };
  }

  return {
    async listVenues() {
      await wait();
      return mockVenues.map(toVenueSummary);
    },

    async getVenue(venueId) {
      await wait();
      const venue = mockVenues.find((v) => v.id === venueId);
      return venue ? toVenueSummary(venue) : null;
    },

    async getFloorPlan(branchId) {
      await wait();
      return floors.get(branchId) ?? null;
    },

    async getBranchTimeZone(branchId) {
      await wait();
      return findBranch(branchId)?.branch.timeZoneId ?? null;
    },

    async getTableAvailability({ branchId, slotUtc, partySize }) {
      await wait();
      return availabilityFor(branchId, slotUtc, partySize);
    },

    async getSlotFloor({ branchId, slotUtc, partySize }) {
      await wait();
      return slotFloorFor(branchId, slotUtc, partySize);
    },

    async requestPhoneCode(phoneE164) {
      await wait();
      const stamps = (codesPerNumber.get(phoneE164) ?? []).filter(
        (t) => now().getTime() - t < 60 * 60_000,
      );
      if (stamps.length >= MAX_CODES_PER_NUMBER) {
        throw new RateLimitedError({
          url: URL_TAG,
          retryAtUtc: new Date((stamps[0] ?? now().getTime()) + 60 * 60_000).toISOString(),
        });
      }
      stamps.push(now().getTime());
      codesPerNumber.set(phoneE164, stamps);

      const id = `ch_${sequence++}`;
      const challenge: Challenge = {
        id,
        phoneE164,
        code: MOCK_CODE,
        expiresAt: now().getTime() + CODE_TTL_MS,
        resendAt: now().getTime() + RESEND_AFTER_MS,
        attempts: 0,
        burned: false,
      };
      challenges.set(id, challenge);

      return {
        challengeId: id,
        phoneE164,
        expiresAtUtc: new Date(challenge.expiresAt).toISOString(),
        resendAvailableAtUtc: new Date(challenge.resendAt).toISOString(),
        // Mirrors the real backend outside production. The UI additionally
        // gates rendering on __DEV__.
        devCode: MOCK_CODE,
      } satisfies PhoneChallenge;
    },

    async verifyPhoneCode({ challengeId, code }) {
      await wait();
      const challenge = challenges.get(challengeId);
      if (!challenge) throw new ExpiredCodeError({ url: URL_TAG });
      if (challenge.burned) throw new TooManyAttemptsError({ url: URL_TAG });
      if (now().getTime() > challenge.expiresAt) throw new ExpiredCodeError({ url: URL_TAG });

      if (code !== challenge.code) {
        challenge.attempts += 1;
        if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
          challenge.burned = true;
          throw new TooManyAttemptsError({ url: URL_TAG });
        }
        throw new WrongCodeError({
          url: URL_TAG,
          attemptsRemaining: MAX_CODE_ATTEMPTS - challenge.attempts,
        });
      }

      challenges.delete(challengeId);
      return {
        verificationToken: `vt_${challenge.phoneE164}_${sequence++}`,
        phoneE164: challenge.phoneE164,
      } satisfies VerifiedPhone;
    },

    async createBooking(command: CreateBookingCommand) {
      await wait();

      // Idempotency first: a retry of the same command must not book twice.
      const existingId = commandLog.get(command.commandId);
      if (existingId) {
        const existing = bookings.get(existingId);
        if (existing) return existing;
      }

      const found = findBranch(command.branchId);
      const floor = floors.get(command.branchId);
      if (!found || !floor) throw new Error(`Unknown branch ${command.branchId}`);
      const policy = DEFAULT_POLICY;

      const table = floor.tables.find((t) => t.id === command.tableId);
      if (!table) throw new Error(`Unknown table ${command.tableId}`);

      // Lead time: the slot may have become too soon while they were deciding.
      const minutesUntilSlot = minutesBetween(now(), new Date(command.slotUtc));
      if (minutesUntilSlot < policy.leadTimeMinutes) {
        throw new LeadTimeExceededError({
          url: URL_TAG,
          leadTimeMinutes: policy.leadTimeMinutes,
          earliestSlotUtc: new Date(
            now().getTime() + policy.leadTimeMinutes * 60_000,
          ).toISOString(),
        });
      }

      // Judged at the slot being booked, not at now — the same projection the
      // availability answer used. Judging it at now would refuse a Saturday
      // booking because somebody is sitting there this evening.
      const refusal = reasonFor(
        table,
        stateAt(table, new Date(command.slotUtc), policy),
        command.partySize,
      );

      const lost = simulateTakenOnce || refusal !== null;
      if (lost) {
        simulateTakenOnce = false;
        // Mark it taken in the mock's world so the refreshed floor is honest.
        const takenState: DerivedTableState = refusal === null ? 'occupied' : table.state;
        const refreshed: FloorPlanData = {
          ...floor,
          tables: floor.tables.map((t) => (t.id === table.id ? { ...t, state: takenState } : t)),
        };
        floors.set(command.branchId, refreshed);

        throw new TableTakenError({
          url: URL_TAG,
          tableId: table.id,
          tableLabel: table.label,
          floor: refreshed,
        });
      }

      const status: BookingStatus =
        command.partySize > policy.instantConfirmationMaxPartySize
          ? 'pendingApproval'
          : 'confirmed';

      const id = `bk_${sequence}`;
      const booking: Booking = {
        id,
        code: reservationCode(sequence++),
        status,
        venueId: found.venue.id,
        venueName: found.venue.name,
        branchId: found.branch.id,
        branchName: found.branch.name,
        timeZoneId: found.branch.timeZoneId,
        tableId: table.id,
        tableLabel: table.label,
        floorAreaName: table.floorAreaName,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        window: windowFor(table, command.slotUtc, policy),
        freeCancellationUntilUtc: new Date(
          new Date(command.slotUtc).getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
        createdAtUtc: now().toISOString(),
        cancelledAtUtc: null,
        // The mock issues one for every booking, so the manage-booking page is
        // walkable from the app's own flow too. See `publicMock.ts` for what
        // the token is and, more importantly, what it is not.
        manageToken: `mbk_${id}`,
      };

      bookings.set(id, booking);
      commandLog.set(command.commandId, id);

      // Reflect the booking on the floor so a second attempt sees it gone.
      floors.set(command.branchId, {
        ...floor,
        tables: floor.tables.map((t) =>
          t.id === table.id
            ? { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc }
            : t,
        ),
      });

      return booking;
    },

    async listBookings() {
      await wait();
      return [...bookings.values()].sort(
        (a, b) => new Date(a.slotUtc).getTime() - new Date(b.slotUtc).getTime(),
      );
    },

    async getBooking(bookingId) {
      await wait();
      return bookings.get(bookingId) ?? null;
    },

    // --- Notifications --------------------------------------------------------
    //
    // The mock has no push channel and cannot pretend to: a token it accepted
    // would never receive anything. What it *can* do honestly is behave like the
    // registration endpoint and hold reservation state, so the routing, the
    // stale-action rule and the one-extension rule are all walkable without a
    // phone in your hand.

    async registerPushDevice({ pushToken }) {
      await wait();
      // Idempotent on the token, as the server is: the app calls this on every
      // launch and on rotation.
      let deviceId = pushDevices.get(pushToken);
      if (!deviceId) {
        deviceId = `device-${pushDevices.size + 1}`;
        pushDevices.set(pushToken, deviceId);
      }
      return { deviceId };
    },

    async getReservationState(reservationId) {
      await wait();
      const booking = bookings.get(reservationId);
      return booking ? toReservationState(booking) : null;
    },

    async cancelReservation({ reservationId }) {
      const booking = await this.cancelBooking(reservationId);
      return toReservationState(booking);
    },

    async extendReservationHold({ reservationId, clientCommandId }) {
      await wait();
      const booking = bookings.get(reservationId);
      if (!booking) throw new Error(`Unknown booking ${reservationId}`);

      const previous = holdExtensions.get(reservationId);
      if (previous) {
        // The same command again is a replay, not a second attempt: a
        // notification is tappable twice and the second tap is not an error.
        if (previous.clientCommandId === clientCommandId) {
          return { ...previous.outcome, wasReplay: true };
        }
        // A genuinely second attempt. The one extension is spent.
        throw new HoldAlreadyExtendedError({ url: URL_TAG, reservationId });
      }

      const minutes = 15;
      const outcome = {
        reservationId,
        holdExpiresAtUtc: new Date(now().getTime() + minutes * 60_000).toISOString(),
        extensionMinutes: minutes,
        extensionsRemaining: 0,
        wasReplay: false,
      };
      holdExtensions.set(reservationId, { clientCommandId, outcome });
      return outcome;
    },

    async cancelBooking(bookingId) {
      await wait();
      const booking = bookings.get(bookingId);
      if (!booking) throw new Error(`Unknown booking ${bookingId}`);

      // Never refuses, even past the deadline: a late cancellation is far
      // better for the venue than a no-show.
      const cancelled: Booking = {
        ...booking,
        status: 'cancelled',
        cancelledAtUtc: now().toISOString(),
      };
      bookings.set(bookingId, cancelled);

      const floor = floors.get(booking.branchId);
      if (floor) {
        floors.set(booking.branchId, {
          ...floor,
          tables: floor.tables.map((t) =>
            t.id === booking.tableId ? { ...t, state: 'free', nextReservationStartUtc: null } : t,
          ),
        });
      }

      return cancelled;
    },

    // --- Scanning in and the shared tab -----------------------------------

    async scanTableCode(command: ScanTableCommand): Promise<ScanResult> {
      await wait();
      return world.scan(command);
    },

    async getTab(tabId): Promise<TableTab | null> {
      await wait();
      return world.get(tabId);
    },

    async leaveTab({ tabId }) {
      await wait();
      world.leave(tabId);
    },

    async getBranchMenu(branchId): Promise<Menu | null> {
      await wait();
      const venue = mockVenues.find((v) => v.branches.some((b) => b.id === branchId));
      return venue ? mockMenuFor(branchId, venue.type) : null;
    },

    async createTabInvite(input): Promise<TabInvite> {
      await wait();
      return world.invite(input);
    },

    async approveJoin(input): Promise<TableTab> {
      await wait();
      return world.approve(input);
    },

    async rejectJoin(input): Promise<TableTab> {
      await wait();
      return world.reject(input);
    },

    async removeParticipant(input): Promise<TableTab> {
      await wait();
      return world.remove(input);
    },

    async setParticipantPermissions(input: {
      tabId: string;
      participantId: string;
      permissions: TabPermissions;
      commandId: string;
    }): Promise<TableTab> {
      await wait();
      return world.setPermissions(input);
    },

    async setTabDefaultPermissions(input: {
      tabId: string;
      permissions: TabPermissions;
      commandId: string;
    }): Promise<TableTab> {
      await wait();
      return world.setDefaults(input);
    },

    async callWaiter(input: {
      tabId: string;
      reason: WaiterCallReason;
      commandId: string;
    }): Promise<WaiterCall> {
      await wait();
      return world.call(input);
    },

    // --- Ordering and the bill ---------------------------------------------

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      await wait();
      const type = venueTypeFor(branchId);
      // Complete items only. The server applies this and the mock did not, so
      // a screen built against the mock was being handed items with empty
      // allergen lists that production would never send.
      return type ? publishedBranchMenu(mockBranchMenu(branchId, type)) : null;
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      await wait();
      const tab = world.get(tabId);
      if (!tab) return null;
      orders.ensure(tab.id, tab.branchId);
      return orders.dinerView(tab, tab.yourParticipantId);
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      await wait();
      const tab = world.get(tabId);
      if (tab) orders.ensure(tab.id, tab.branchId);
      return orders.events(tabId, afterSequence);
    },

    async placeOrder(command): Promise<PlaceOrderResult> {
      await wait();
      const tab = world.get(command.tabId);
      if (!tab) throw new NotFoundError({ url: `/api/tabs/${command.tabId}/orders` });
      return orders.place(tab, command);
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      await wait();
      const tab = world.get(tabId);
      return tab ? orders.shares(tab, tab.yourParticipantId) : null;
    },

    async setSettlementMode(command): Promise<DinerTabView> {
      await wait();
      const tab = world.get(command.tabId);
      if (!tab) throw new NotFoundError({ url: `/api/tabs/${command.tabId}/settlement-mode` });
      if (tab.yourRole !== 'host') {
        throw new NotTabHostError({ url: `/api/tabs/${command.tabId}/settlement-mode` });
      }
      orders.setSettlementMode(tab, command.mode);
      return orders.dinerView(tab, tab.yourParticipantId);
    },
  };
}
