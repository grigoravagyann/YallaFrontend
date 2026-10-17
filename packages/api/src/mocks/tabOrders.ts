import type { Photo } from '../contracts/menuAdmin';
import type {
  BillScope,
  BranchMenu,
  DinerTabLine,
  DinerTabView,
  MenuItemDetail,
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
import { computeBill, quoteBill, type BillQuoteFigures, type BillingLine } from './billing';

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

/**
 * The branch percentage, snapshotted when a tab opens.
 *
 * Used by the mock's own arithmetic only. **No diner endpoint carries it** —
 * the one view that does is `ReservationPolicyView`, behind `ManagerOrAbove` —
 * so nothing projected to a diner may state it.
 */
export const MOCK_SERVICE_CHARGE_PERCENT = 10;

/**
 * A tab line narrowed to what `TabLineView` actually carries.
 *
 * The mock stores the richer staff-side line because its void and adjustment
 * paths need it. The diner projection throws that away, exactly as the server
 * does: no note, no menu item, no order id, no status.
 */
function dinerLine(line: TabLine): DinerTabLine {
  return {
    id: line.id,
    orderId: line.orderId,
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    unitPriceDram: line.unitPriceDram,
    lineTotalDram: line.lineTotalDram,
    isShared: line.isShared || line.isTableAttributed,
    participantId: line.participantId,
    orderedByName: line.orderedByName,
    note: line.note,
    orderStatus: line.orderStatus,
    sharedWithCount: line.sharedWithCount,
    isVoided: line.status === 'voided',
    voidReason: line.voidReason,
    voidedAtUtc: null,
  };
}

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
  /**
   * A participant's photo, by the server's rule — the account they scanned in
   * with, when it has one. Absent: nobody on any tab has one.
   */
  readonly participantPhoto?: ((tabId: string, participantId: string) => Photo | null) | undefined;
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
  /**
   * What each participant paid against their own share. A payment taken
   * against the table, with nobody named, is in `paidDram` and in nobody's
   * row here — the server's ledger, `TabLedger.Compute`.
   */
  readonly paidByParticipant: Map<string, number>;
  /** Tips left with the payments, kept apart from `paidDram` as the server keeps them. */
  tipsDram: number;
  sequence: number;
}

export function createTabOrders(options: TabOrdersOptions) {
  const { now, menuItem, branchMenu } = options;
  const photoOf = options.participantPhoto ?? (() => null);

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
        paidByParticipant: new Map(),
        tipsDram: 0,
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
        paidDram: record.paidByParticipant.get(person.id) ?? 0,
      }))
      .sort((a, b) => Number(b.isHost) - Number(a.isHost));
  }

  /** `TabPermissions.MaySeeTableTotal`: approved, and allowed to. */
  function seesTableTotal(tab: TableTab, participantId: string): boolean {
    const person = tab.participants.find((entry) => entry.id === participantId);
    return person?.status === 'active' && person.permissions.canSeeTableTotal;
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
          // Zero when it does not split, matching the share record written
          // two lines below — which already stored an empty array here while
          // this said 1.
          sharedWithCount: splits ? presentIds.length : 0,
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

    /**
     * Cash against the balance, and a tip beside it. The tip never touches
     * `paidDram`: a tip folded into what was paid is how a tab looks settled
     * while money is still owed.
     *
     * With a participant named, it is credited to their share — what "my
     * share" settles. Without one it is the table's: the balance goes down and
     * nobody's share is marked paid, as the server's ledger does it.
     */
    pay(tab: TableTab, amountDram: number, tipDram = 0, participantId: string | null = null): void {
      const record = contentFor(tab.id, tab.branchId);
      record.paidDram += amountDram;
      if (participantId !== null) {
        record.paidByParticipant.set(
          participantId,
          (record.paidByParticipant.get(participantId) ?? 0) + amountDram,
        );
      }
      record.tipsDram += tipDram;
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

    /**
     * Who owes what, projected through the caller's own visibility.
     *
     * `participantId` is what the real endpoint reads from the token, so the
     * mock takes it explicitly rather than answering as an omniscient observer.
     * It used to return `kind: 'table'` unconditionally with `yourShare: null`,
     * which meant the hidden-total branch was unreachable through the mock and
     * every screen that narrows on it was untested.
     */
    shares(tab: TableTab, participantId: string): TabShares {
      const record = contentFor(tab.id, tab.branchId);
      const { bill: computed, shares } = bill(tab, record);
      const me = tab.participants.find((person) => person.id === participantId);
      const mine = shares.find((share) => share.participantId === participantId) ?? null;

      // `TabSharesView.tableTotalVisible` false means `totals` and `shares` are
      // absent from the body. Not zeroed, and not empty arrays.
      if (!(me?.permissions.canSeeTableTotal ?? false)) {
        return {
          kind: 'yourShareOnly',
          tabId: tab.id,
          absorbedFromRemovedDram: computed.absorbedFromRemovedDram,
          yourShare: mine,
        };
      }

      return {
        kind: 'table',
        tabId: tab.id,
        totals: computed,
        absorbedFromRemovedDram: computed.absorbedFromRemovedDram,
        yourShare: mine,
        shares: shares.filter((share) =>
          tab.participants.some(
            (person) => person.id === share.participantId && person.status === 'active',
          ),
        ),
      };
    },

    /** Whether this participant may see the table's total: approved and allowed to. */
    seesTableTotal(tab: TableTab, participantId: string): boolean {
      return seesTableTotal(tab, participantId);
    },

    /**
     * A bill request's amount and tip, by the shared money rules (`quoteBill`)
     * from the same split the shares view shows. Somebody with no share —
     * pending, or not on the tab — has nothing to pay on `mine`. Whether they
     * may ask for `whole` at all is the caller's 403.
     */
    billQuote(
      tab: TableTab,
      participantId: string,
      scope: BillScope,
      tipPercent: number,
    ): BillQuoteFigures {
      const record = contentFor(tab.id, tab.branchId);
      const { bill: computed, shares } = bill(tab, record);
      return quoteBill({
        bill: computed,
        share: shares.find((share) => share.participantId === participantId) ?? null,
        scope,
        tipPercent,
        canSeeTableTotal: seesTableTotal(tab, participantId),
      });
    },

    /** What the tab still owes, service charge in. */
    remaining(tab: TableTab): number {
      return bill(tab, contentFor(tab.id, tab.branchId)).bill.remainingDram;
    },

    /**
     * A tab event the ordering half does not cause itself — a service request
     * raised or acknowledged, the tab closed — on the same stream, so the
     * sequence a phone follows stays one sequence.
     */
    record(
      tab: TableTab,
      type: Extract<
        TabEvent['type'],
        'serviceRequested' | 'serviceRequestAcknowledged' | 'tabClosed'
      >,
      actor: TabEvent['actor'],
      data: Record<string, unknown> | null,
    ): void {
      push(contentFor(tab.id, tab.branchId), type, actor, null, data);
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

      /**
       * Voided lines stay, marked, as the server now keeps them.
       *
       * `TabProjection` keeps a voided line in both arrays with `isVoided` and
       * the reason, worth zero. A mock that dropped them — which this used to —
       * let the bill be built against a line that silently vanishes.
       */
      const allLines = record.lines;

      const visibleLines = canSeeTableTotal
        ? allLines
        : allLines.filter(
            (line) =>
              line.participantId === participantId || line.isShared || line.isTableAttributed,
          );

      let money: TabMoney;
      if (canSeeTableTotal) {
        const { bill: computed } = bill(tab, record);
        money = { kind: 'table', bill: computed, tipsDram: record.tipsDram };
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
        money = { kind: 'ownItemsOnly', yourItemsSubtotalDram: own.bill.subtotalDram };
      }

      const host = tab.participants.find((person) => person.role === 'host') ?? null;
      const statusOf = (status: TabParticipant['status']) =>
        status === 'active'
          ? ('approved' as const)
          : status === 'pending'
            ? ('pendingApproval' as const)
            : ('removed' as const);
      const mePending = me?.status === 'pending';

      return {
        tabId: tab.id,
        branchId: tab.branchId,
        venueName: tab.venueName,
        branchName: tab.branchName,
        timeZoneId: tab.timeZoneId,
        tableLabel: tab.tableLabel,
        status: tab.status === 'closed' ? 'closed' : 'open',
        settlementMode: record.settlementMode,
        settlementModeLocked: record.settlementModeLocked,
        hostParticipantId: host?.id ?? null,
        hideTotalFromGuests: !(tab.defaultPermissions.canSeeTableTotal ?? true),
        me: {
          participantId: participantId,
          displayName: me?.displayName ?? '',
          role: me?.role ?? 'guest',
          status: me ? statusOf(me.status) : 'removed',
          canOrder: me?.permissions.canOrder ?? false,
          // The same three-way rule the ordering endpoint enforces, in one
          // place. A screen must never assemble this itself.
          canOrderNow:
            (me?.permissions.canOrder ?? false) && me?.status === 'active' && tab.status === 'open',
          canPay: me?.permissions.canPay ?? false,
          canSeeTableTotal,
          joinedAtUtc: me?.joinedAtUtc ?? tab.openedAtUtc,
          photo: photoOf(tab.id, participantId),
        },
        // The whole table for an approved participant; only themself while
        // pending — which is what the server sends.
        participants: tab.participants
          .filter((person) => !mePending || person.id === participantId)
          .map((person) => ({
            participantId: person.id,
            displayName: person.displayName ?? '',
            role: person.role,
            status: statusOf(person.status),
            photo: photoOf(tab.id, person.id),
          })),
        myLines: visibleLines
          .filter((line) => line.participantId === participantId || line.isShared)
          .map(dinerLine),
        // `null`, not `[]`. "You are not shown the table's items" and "the table
        // has ordered nothing" must not be the same value.
        tableLines: canSeeTableTotal ? visibleLines.map(dinerLine) : null,
        money,
        serviceChargePercent: MOCK_SERVICE_CHARGE_PERCENT,
        adjustments: record.adjustments.map((adjustment) => ({
          id: adjustment.id,
          kind: adjustment.kind,
          lineId: adjustment.lineId,
          percent: adjustment.percent,
          amountDram: adjustment.amountDram,
          reductionDram: adjustment.reductionDram,
          reason: adjustment.reason,
          isVoided: adjustment.isVoided,
          atUtc: adjustment.atUtc,
        })),
        maxSequence: record.sequence,
        openedAtUtc: tab.openedAtUtc,
        closedAtUtc: tab.closedAtUtc,
        fetchedAtUtc: iso(now()),
      };
    },
  };
}

export type TabOrders = ReturnType<typeof createTabOrders>;
