import type {
  BranchMenu,
  DinerTabView,
  MenuItemDetail,
  ParticipantShare,
  PlaceOrderCommand,
  PlaceOrderResult,
  TabAdjustment,
  TabEvent,
  TabEventPage,
  TabLine,
  TabMoney,
  TabShares,
} from '../contracts/ordering';
import type { SettlementMode } from '../contracts/service';
import type { TabParticipant, TableTab } from '../contracts/tab';
import { computeBill, type BillingLine } from './billing';

/**
 * The ordering and billing half of a mock tab.
 *
 * Kept beside `tabs.ts` rather than inside it because the two have different
 * jobs: that one owns who is on a tab and what they may do, this one owns what
 * they ordered and what it comes to. Both are read by the same projections.
 *
 * Everything about money here goes through the shared port of the server's
 * arithmetic in `billing.ts`. Nothing in this file adds up a price.
 */

/** The branch percentage, snapshotted when a tab opens. */
export const MOCK_SERVICE_CHARGE_PERCENT = 10;

interface MockOrder {
  readonly id: string;
  readonly tabId: string;
  readonly placedAtUtc: string;
  readonly estimatedReadyAtUtc: string | null;
  readonly lineIds: string[];
}

export interface TabOrdersOptions {
  readonly now: () => Date;
  /** Resolves a menu item, so a line can snapshot its name and price. */
  readonly menuItem: (branchId: string, itemId: string) => MenuItemDetail | undefined;
  readonly branchMenu: (branchId: string) => BranchMenu | null;
}

interface TabContent {
  readonly tabId: string;
  readonly branchId: string;
  readonly lines: TabLine[];
  /**
   * Who was on each shared line when it was ordered.
   *
   * The server has these rows (`TabOrderLineShare`); the client's `TabLine`
   * carries only the count, because a diner needs to know a bottle split four
   * ways and does not need a list of participant ids to render a badge. The
   * mock keeps the ids because the arithmetic needs them.
   */
  readonly shareIds: Map<string, readonly string[]>;
  readonly adjustments: TabAdjustment[];
  readonly orders: MockOrder[];
  readonly events: TabEvent[];
  settlementMode: SettlementMode;
  settlementModeLocked: boolean;
  paidDram: number;
  sequence: number;
}

export function createTabOrders(options: TabOrdersOptions) {
  const { now, menuItem, branchMenu } = options;

  const content = new Map<string, TabContent>();
  /** clientCommandId -> the original result. The idempotency log. */
  const placed = new Map<string, PlaceOrderResult>();
  let counter = 0;
  const id = (prefix: string) => `${prefix}-${(counter += 1)}`;

  const iso = (date: Date) => date.toISOString();

  function contentFor(tabId: string, branchId: string): TabContent {
    let record = content.get(tabId);
    if (!record) {
      record = {
        tabId,
        branchId,
        lines: [],
        shareIds: new Map(),
        adjustments: [],
        orders: [],
        events: [],
        settlementMode: 'everyonePaysOwnItems',
        settlementModeLocked: false,
        paidDram: 0,
        sequence: 0,
      };
      content.set(tabId, record);
      push(record, 'tabOpened', 'system', null);
    }
    return record;
  }

  function push(
    record: TabContent,
    type: TabEvent['type'],
    actor: TabEvent['actor'],
    actorName: string | null,
    data: Record<string, unknown> | null = null,
  ): TabEvent {
    record.sequence += 1;
    const event: TabEvent = {
      sequence: record.sequence,
      tabId: record.tabId,
      type,
      actor,
      actorId: null,
      actorName,
      atUtc: iso(now()),
      data,
    };
    record.events.push(event);
    return event;
  }

  /** Everyone who counts for a split, in join order with the host first. */
  function billingParticipants(tab: TableTab, record: TabContent) {
    return tab.participants
      .filter((person) => person.status !== 'rejected')
      .map((person) => ({
        participantId: person.id,
        displayName: person.displayName,
        isHost: person.role === 'host',
        status:
          person.status === 'active'
            ? ('approved' as const)
            : person.status === 'pending'
              ? ('pendingApproval' as const)
              : ('removed' as const),
        paidDram: 0,
      }))
      .sort((a, b) => Number(b.isHost) - Number(a.isHost))
      .map((person) => ({ ...person, paidDram: person.isHost ? record.paidDram : 0 }));
  }

  function bill(tab: TableTab, record: TabContent) {
    return computeBill({
      lines: record.lines.map((line): BillingLine => ({
        lineId: line.id,
        ownerParticipantId: line.participantId,
        unitPriceDram: line.unitPriceDram,
        quantity: line.quantity,
        isVoided: line.status === 'voided',
        isSplitAcrossParticipants: line.isShared || line.isTableAttributed,
        shareParticipantIds: record.shareIds.get(line.id) ?? [],
      })),
      adjustments: record.adjustments.map((adjustment) => ({
        lineId: adjustment.lineId,
        percent: adjustment.percent,
        amountDram: adjustment.amountDram,
      })),
      participants: billingParticipants(tab, record),
      serviceChargePercent: MOCK_SERVICE_CHARGE_PERCENT,
      paidDram: record.paidDram,
    });
  }

  /** Initials, so a line can say whose it is without a full name. */
  function shortName(participant: TabParticipant | undefined): string | null {
    if (!participant?.displayName) return null;
    const parts = participant.displayName.trim().split(/\s+/);
    return parts.length > 1
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toLocaleUpperCase()
      : participant.displayName;
  }

  return {
    /** For a fresh tab, so the projections have something to read. */
    ensure(tabId: string, branchId: string): void {
      contentFor(tabId, branchId);
    },

    lines(tabId: string): readonly TabLine[] {
      return content.get(tabId)?.lines ?? [];
    },

    settlementMode(tabId: string): SettlementMode {
      return content.get(tabId)?.settlementMode ?? 'everyonePaysOwnItems';
    },

    menu(branchId: string): BranchMenu | null {
      return branchMenu(branchId);
    },

    place(tab: TableTab, command: PlaceOrderCommand): PlaceOrderResult {
      const previous = placed.get(command.clientCommandId);
      // The server recognises a repeated command id and replays its original
      // answer. Same handling as a fresh success — this is the case a lost
      // response produces, and treating it as new is how a round doubles.
      if (previous) return { ...previous, wasReplay: true };

      const record = contentFor(tab.id, tab.branchId);
      const at = now();
      const orderId = command.clientCommandId;

      // Who is at the table right now. Snapshotted onto every shared line, so a
      // friend who arrives later is not on it.
      const presentIds = tab.participants
        .filter((person) => person.status === 'active')
        .map((person) => person.id);

      let longestPrep = 0;
      const lineIds: string[] = [];

      for (const requested of command.lines) {
        const item = menuItem(tab.branchId, requested.menuItemId);
        if (!item) continue;
        longestPrep = Math.max(longestPrep, item.prepMinutes);

        const owner = tab.participants.find((person) => person.id === requested.participantId);
        const lineId = id('line');
        const splits = requested.isShared || requested.participantId === null;

        record.lines.push({
          id: lineId,
          orderId,
          menuItemId: item.id,
          name: item.name,
          quantity: requested.quantity,
          unitPriceDram: item.priceDram,
          lineTotalDram: item.priceDram * requested.quantity,
          note: requested.note ?? null,
          isShared: requested.isShared,
          isTableAttributed: requested.participantId === null,
          participantId: requested.participantId,
          orderedByName: shortName(owner),
          sharedWithCount: splits ? presentIds.length : 1,
          status: 'active',
          voidReason: null,
          voidedByName: null,
          placedAtUtc: iso(at),
          orderStatus: 'new',
        });
        record.shareIds.set(lineId, splits ? presentIds : []);
        lineIds.push(lineId);
      }

      const estimatedReadyAtUtc =
        longestPrep > 0 ? iso(new Date(at.getTime() + longestPrep * 60_000)) : null;

      record.orders.push({
        id: orderId,
        tabId: tab.id,
        placedAtUtc: iso(at),
        estimatedReadyAtUtc,
        lineIds,
      });

      push(record, 'orderPlaced', 'diner', null, { orderId });

      const result: PlaceOrderResult = {
        orderId,
        tabId: tab.id,
        status: 'new',
        placedAtUtc: iso(at),
        estimatedReadyAtUtc,
        wasReplay: false,
        totals: bill(tab, record).bill,
      };
      placed.set(command.clientCommandId, result);
      return result;
    },

    /** A waiter adds a spoken order from the tablet. */
    placeByStaff(tab: TableTab, command: PlaceOrderCommand, staffName: string): PlaceOrderResult {
      const result = this.place(tab, command);
      const record = contentFor(tab.id, tab.branchId);
      const event = record.events[record.events.length - 1];
      if (event?.type === 'orderPlaced') {
        record.events[record.events.length - 1] = {
          ...event,
          actor: 'staff',
          actorName: staffName,
        };
      }
      return result;
    },

    void(tab: TableTab, lineId: string, reason: string, byName: string): void {
      const record = contentFor(tab.id, tab.branchId);
      const index = record.lines.findIndex((line) => line.id === lineId);
      const line = record.lines[index];
      if (!line) return;
      record.lines[index] = {
        ...line,
        status: 'voided',
        lineTotalDram: 0,
        voidReason: reason,
        voidedByName: byName,
      };
      push(record, 'lineVoided', 'staff', byName, { lineId });
    },

    adjust(
      tab: TableTab,
      input: {
        kind: TabAdjustment['kind'];
        lineId: string | null;
        percent: number | null;
        amountDram: number | null;
        reason: string;
        byName: string;
      },
    ): void {
      const record = contentFor(tab.id, tab.branchId);
      const before = bill(tab, record).bill.subtotalDram;
      record.adjustments.push({
        id: id('adj'),
        kind: input.kind,
        lineId: input.lineId,
        percent: input.percent,
        amountDram: input.amountDram,
        isVoided: false,
        reductionDram: 0,
        reason: input.reason,
        byName: input.byName,
        atUtc: iso(now()),
      });
      const after = bill(tab, record).bill.subtotalDram;
      const last = record.adjustments[record.adjustments.length - 1];
      if (last) {
        // What it actually took off, from the arithmetic rather than from the
        // percentage: a 100% comp on a line already discounted takes off less
        // than the menu price, and the row has to say the real number.
        record.adjustments[record.adjustments.length - 1] = {
          ...last,
          reductionDram: Math.max(0, before - after),
        };
      }
      push(record, 'adjustmentAdded', 'staff', input.byName);
    },

    setSettlementMode(tab: TableTab, mode: SettlementMode): void {
      const record = contentFor(tab.id, tab.branchId);
      if (record.settlementModeLocked) return;
      record.settlementMode = mode;
      push(record, 'settlementModeChanged', 'diner', null, { mode });
    },

    pay(tab: TableTab, amountDram: number): void {
      const record = contentFor(tab.id, tab.branchId);
      record.paidDram += amountDram;
      // Locked from the first payment: changing how a bill splits after money
      // has landed against it would re-apportion what somebody already paid.
      record.settlementModeLocked = true;
      push(record, 'paymentRecorded', 'staff', 'Aram');
    },

    events(tabId: string, afterSequence: number): TabEventPage {
      const record = content.get(tabId);
      const events = (record?.events ?? []).filter((event) => event.sequence > afterSequence);
      return {
        tabId,
        lastSequence:
          events.length > 0
            ? (events[events.length - 1]?.sequence ?? afterSequence)
            : (record?.sequence ?? afterSequence),
        events,
        hasMore: false,
      };
    },

    shares(tab: TableTab): TabShares {
      const record = contentFor(tab.id, tab.branchId);
      const { bill: computed, shares } = bill(tab, record);
      return {
        kind: 'table',
        tabId: tab.id,
        totals: computed,
        absorbedFromRemovedDram: computed.absorbedFromRemovedDram,
        yourShare: null,
        shares: shares.filter((share) =>
          tab.participants.some(
            (person) => person.id === share.participantId && person.status === 'active',
          ),
        ),
      };
    },

    /**
     * The tab as one participant may see it.
     *
     * The permission rule is applied **here**, in the mock's server half, and
     * arrives at the client already applied. A participant without
     * `canSeeTableTotal` gets their own lines and a `money` branch that has no
     * aggregate on it at all — not a zero, which the union makes impossible to
     * render by accident.
     */
    dinerView(tab: TableTab, participantId: string): DinerTabView {
      const record = contentFor(tab.id, tab.branchId);
      const me = tab.participants.find((person) => person.id === participantId);
      const canSeeTableTotal = me?.permissions.canSeeTableTotal ?? false;

      const visibleLines = canSeeTableTotal
        ? record.lines
        : record.lines.filter(
            (line) =>
              line.participantId === participantId || line.isShared || line.isTableAttributed,
          );

      let money: TabMoney;
      if (canSeeTableTotal) {
        const { bill: computed, shares } = bill(tab, record);
        money = {
          kind: 'table',
          bill: computed,
          serviceChargePercent: MOCK_SERVICE_CHARGE_PERCENT,
          yourShare:
            (shares.find((share) => share.participantId === participantId) as
              ParticipantShare | undefined) ?? null,
        };
      } else {
        // Their own lines only, summed by the same arithmetic — a voided line
        // counts zero here exactly as it does on the table's bill.
        const own = computeBill({
          lines: visibleLines
            .filter((line) => line.participantId === participantId && !line.isShared)
            .map((line): BillingLine => ({
              lineId: line.id,
              ownerParticipantId: participantId,
              unitPriceDram: line.unitPriceDram,
              quantity: line.quantity,
              isVoided: line.status === 'voided',
              isSplitAcrossParticipants: false,
              shareParticipantIds: [],
            })),
          adjustments: [],
          participants: [
            {
              participantId,
              displayName: me?.displayName ?? null,
              isHost: false,
              status: 'approved',
              paidDram: 0,
            },
          ],
          serviceChargePercent: 0,
          paidDram: 0,
        });
        money = {
          kind: 'ownItemsOnly',
          yourItemsSubtotalDram: own.bill.subtotalDram,
          serviceChargePercent: MOCK_SERVICE_CHARGE_PERCENT,
        };
      }

      return {
        tabId: tab.id,
        branchId: tab.branchId,
        tableLabel: tab.tableLabel,
        timeZoneId: tab.timeZoneId,
        status: tab.status === 'closed' ? 'closed' : 'open',
        settlementMode: record.settlementMode,
        settlementModeLocked: record.settlementModeLocked,
        lines: visibleLines,
        // Adjustments are only meaningful beside a table total.
        adjustments: canSeeTableTotal ? record.adjustments : [],
        money,
        lastSequence: record.sequence,
        asOfUtc: iso(now()),
      };
    },
  };
}

export type TabOrders = ReturnType<typeof createTabOrders>;
