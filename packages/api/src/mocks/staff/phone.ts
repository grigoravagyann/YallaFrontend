import type { MyPerformanceQuery, StaffMemberPerformance } from '../../contracts/activity';
import type {
  StaffPushConfig,
  StaffPushSubscriptionInput,
  StaffNotificationSettings,
  SaveStaffNotificationSettings,
  StaffToday,
} from '../../contracts/staffPhone';
import { ValidationError } from '../../errors';
import { mockVenues } from '../venues';
import { fixtureStaffFor } from '../staffFixture';
import { mockRosterShiftsAround } from '../staffRosterMock';
import { staffRoleToUserRole } from '../../auth/endpoints';
import { localDateAndTime } from '../approvalWindow';
import type { StaffGateway } from '../../staffGateway';
import {
  type StaffMockContext,
  EARLIER_CAME,
  EARLIER_GUESTS_BOOKED,
  EARLIER_HALL_AMD,
  EARLIER_TAKEAWAY_AMD,
  EARLIER_TAKEAWAY_ORDERS,
  EARLIER_WALK_INS,
  iso,
  MOCK_VAPID_PUBLIC_KEY,
} from './context';

/** The device itself: unpairing, push, notification settings, Today and My results. */
export function phoneMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  | 'getMyPerformance'
  | 'unpairOwnPhone'
  | 'getPushConfig'
  | 'savePushSubscription'
  | 'deletePushSubscription'
  | 'getNotificationSettings'
  | 'saveNotificationSettings'
  | 'getToday'
> {
  const {
    FLOOR_BRANCH,
    activity,
    awaiting,
    calm,
    conversations,
    me,
    now,
    phonePush,
    plan,
    requireSession,
    reservations,
    seatedBookings,
    settle,
    sweepAwaiting,
    tables,
    tabs,
  } = ctx;
  return {
    async getMyPerformance(query: MyPerformanceQuery): Promise<StaffMemberPerformance> {
      const url = '/api/staff/me/performance';
      requireSession(url);
      const self = me();
      const range = { from: query.from, to: query.to };
      const page = activity.member(url, ctx.branchId, self.id, range);
      const list = query.list ?? 'orders';
      const recent =
        page && list !== 'orders'
          ? activity.recent(url, ctx.branchId, self.id, range, list, null)
          : (page?.recent ?? { list, items: [], nextCursor: null });
      const limit = query.limit ?? 50;
      const empty = {
        tables: 0,
        guests: 0,
        salesAmd: 0,
        averageCheckAmd: null,
        tipsAmd: 0,
        callMedianSeconds: null,
        callsClaimed: 0,
        replyMedianSeconds: null,
        messagesAnswered: 0,
        approvals: 0,
        declines: 0,
        cashAmd: 0,
        cashPayments: 0,
        discounts: 0,
        comps: 0,
        adjustmentsAmd: 0,
        voids: 0,
      };
      return settle({
        ...range,
        staffMemberId: self.id,
        name: page?.name ?? self.name,
        role: page?.role ?? 'waiter',
        isActive: true,
        figures: page?.figures ?? empty,
        daily: page?.daily ?? [],
        recent: {
          list,
          items: recent.items.slice(0, limit),
          nextCursor: recent.items.length > limit ? 'more' : recent.nextCursor,
        },
      });
    },

    // --- The device itself: a personal phone, its pushes (2026-10-24) ---------

    async unpairOwnPhone(): Promise<void> {
      requireSession('/api/staff/device/unpair');
      await calm(undefined);
      phonePush.subscribed = false;
    },

    async getPushConfig(): Promise<StaffPushConfig> {
      // The mock "sends" nothing, but says it would: the install screen's
      // switches are walkable, and subscribing is the browser's own business.
      return calm({ enabled: true, publicKey: MOCK_VAPID_PUBLIC_KEY });
    },

    async savePushSubscription(subscription: StaffPushSubscriptionInput): Promise<void> {
      requireSession('/api/staff/device/push-subscription');
      if (!/^https:\/\//u.test(subscription.endpoint)) {
        throw new ValidationError({
          status: 422,
          url: '/api/staff/device/push-subscription',
          problem: {
            type: '',
            title: 'Validation failed',
            status: 422,
            detail: 'endpoint must be an https URL on a known push service.',
            code: 'validation-failed',
            traceId: 'mock',
            context: { field: 'endpoint' },
          },
        });
      }
      await calm(undefined);
      phonePush.subscribed = true;
    },

    async deletePushSubscription(): Promise<void> {
      requireSession('/api/staff/device/push-subscription');
      await calm(undefined);
      phonePush.subscribed = false;
    },

    async getNotificationSettings(): Promise<StaffNotificationSettings> {
      requireSession('/api/staff/device/notification-preferences');
      return calm({
        ...phonePush.switches,
        locale: phonePush.locale,
        subscribed: phonePush.subscribed,
        isDefault: phonePush.isDefault,
      });
    },

    async saveNotificationSettings(
      settings: SaveStaffNotificationSettings,
    ): Promise<StaffNotificationSettings> {
      requireSession('/api/staff/device/notification-preferences');
      phonePush.switches = {
        approvals: settings.approvals,
        guestMessages: settings.guestMessages,
        tableCalls: settings.tableCalls,
        takeaway: settings.takeaway,
        kitchenReady: settings.kitchenReady,
        onlyDuringShift: settings.onlyDuringShift,
      };
      if (settings.locale) phonePush.locale = settings.locale;
      phonePush.isDefault = false;
      return calm({
        ...phonePush.switches,
        locale: phonePush.locale,
        subscribed: phonePush.subscribed,
        isDefault: false,
      });
    },

    async getToday(requested?: string): Promise<StaffToday> {
      requireSession('/api/staff/today');
      // Today can be read before the floor is: the branch it names is the floor's.
      if (requested && !ctx.floorAdopted) {
        ctx.branchId = requested;
        ctx.floorAdopted = true;
      }
      const at = now();
      const venue = mockVenues.find((candidate) =>
        candidate.branches.some((one) => one.id === ctx.branchId),
      );
      const siblings = venue?.branches ?? [];
      const target =
        requested && siblings.some((one) => one.id === requested) ? requested : ctx.branchId;
      const branchName =
        siblings.find((one) => one.id === target)?.name ?? plan.branchName ?? 'Northern Avenue';
      const people = venue ? fixtureStaffFor(venue.id, venue.name, venue.branches) : [];
      const shifts = mockRosterShiftsAround(people, target, at).map((shift) => {
        const member = people.find((person) => person.id === shift.staffMemberId);
        const start = Date.parse(shift.startsAtUtc);
        const end = Date.parse(shift.endsAtUtc);
        const onShiftNow = start <= at.getTime() && at.getTime() < end;
        const clock = (instant: number) =>
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            timeZone: plan.timeZoneId,
          }).format(instant);
        return {
          staffMemberId: shift.staffMemberId,
          fullName: member?.fullName ?? '',
          role: staffRoleToUserRole(member?.role ?? 'waiter'),
          startsAt: clock(start),
          endsAt: clock(end),
          endsNextDay: clock(end) <= clock(start),
          startsAtUtc: shift.startsAtUtc,
          endsAtUtc: shift.endsAtUtc,
          onShiftNow,
          // Whoever is on shift is signed in somewhere, as on a Friday.
          signedIn: onShiftNow,
        };
      });
      const sinceUtc = iso(new Date(at.getTime() - 6 * 60 * 60_000));
      const base = {
        branchId: target,
        branchName,
        venueName: venue?.name ?? 'Lumen Coffee',
        timeZoneId: plan.timeZoneId,
        asOfUtc: iso(at),
        serviceDate: localDateAndTime(iso(at), plan.timeZoneId).localDate,
        localTime: localDateAndTime(iso(at), plan.timeZoneId).localStartTime.slice(0, 5),
        branches: (siblings.length > 0 ? siblings : [{ id: ctx.branchId, name: branchName }]).map(
          (one) => ({ branchId: one.id, name: one.name }),
        ),
        shifts,
      };

      if (target !== ctx.branchId) {
        // Another branch of the venue: the mock has one floor, so its numbers
        // are a fixed day rather than a live room.
        return calm({
          ...base,
          revenue: {
            totalAmd: 187_500,
            hallAmd: 187_500,
            takeawayAmd: 0,
            takeawayOrders: 0,
            sinceUtc,
          },
          guests: { total: 41, withBooking: 30, walkIn: 11 },
          bookings: { total: 15, came: 9, expected: 6, late: 1, noShow: 0, pendingApproval: 0 },
          room: { occupiedTables: 5, tables: 10, people: 17 },
          needsYou: {
            pendingApprovals: 0,
            oldestApprovalRequestedAtUtc: null,
            soonestApprovalDeadlineUtc: null,
            unansweredMessages: 0,
            oldestUnansweredMessageAtUtc: null,
          },
        });
      }

      // This floor, live: the room, the waiting bookings and the inbox are
      // the mock's own state; the day before the mock started is a fixture.
      sweepAwaiting(at);
      const states = [...tables.values()];
      const occupied = states.filter((state) => state.physicalStatus === 'occupied');
      const seatedPeople = occupied.reduce((sum, state) => sum + (state.partySize ?? 0), 0);
      const hallAmd =
        EARLIER_HALL_AMD + [...tabs.values()].reduce((sum, tab) => sum + tab.paidDram, 0);
      const takeawayAmd = EARLIER_TAKEAWAY_AMD;
      const pending = [...awaiting.values()].filter((one) => one.status === 'pendingApproval');
      const booked = [...reservations.values()];
      const came = booked.filter((one) => seatedBookings.has(one.id)).length + EARLIER_CAME;
      const noShow = booked.filter((one) => one.releasedAs === 'noShow').length;
      const expectedList = booked.filter((one) => !one.released && !seatedBookings.has(one.id));
      const inbox = conversations.branchConversations(FLOOR_BRANCH);
      const unanswered = inbox.items
        .map((item) => item.oldestUnansweredGuestMessageUtc)
        .filter((when): when is string => typeof when === 'string')
        .sort();
      const bookedNow = booked
        .filter((one) => seatedBookings.has(one.id))
        .reduce((sum, one) => sum + one.partySize, 0);
      const withBooking = EARLIER_GUESTS_BOOKED + bookedNow;
      const walkIn = EARLIER_WALK_INS + Math.max(0, seatedPeople - bookedNow);
      return calm({
        ...base,
        revenue: {
          totalAmd: hallAmd + takeawayAmd,
          hallAmd,
          takeawayAmd,
          takeawayOrders: EARLIER_TAKEAWAY_ORDERS,
          sinceUtc,
        },
        guests: { total: withBooking + walkIn, withBooking, walkIn },
        bookings: {
          total: came + noShow + expectedList.length + pending.length,
          came,
          expected: expectedList.length,
          late: expectedList.filter((one) => Date.parse(one.startUtc) < at.getTime()).length,
          noShow,
          pendingApproval: pending.length,
        },
        room: { occupiedTables: occupied.length, tables: states.length, people: seatedPeople },
        needsYou: {
          pendingApprovals: pending.length,
          oldestApprovalRequestedAtUtc: null,
          soonestApprovalDeadlineUtc:
            pending
              .map((one) => one.approvalExpiresAtUtc)
              .filter((when): when is string => typeof when === 'string')
              .sort()[0] ?? null,
          unansweredMessages: unanswered.length,
          oldestUnansweredMessageAtUtc: unanswered[0] ?? null,
        },
      });
    },
  };
}
