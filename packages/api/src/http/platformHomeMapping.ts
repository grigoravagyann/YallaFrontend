import type { UserRole } from '../contracts/console';
import type {
  OutboxCounts,
  OutboxHealth,
  PlatformActivityEntry,
  PlatformAdminProfile,
  PlatformOverview,
  VenueCounter,
} from '../contracts/platformHome';
import type { components } from '../generated/schema';
import { branchFeaturesFromWire } from './branchFeatureMapping';
import { readinessIssueFromWire, venueStatusFromWire } from './consoleMapping';
import { staffRole } from './staffAdminMapping';
import { venueTypeFromCode } from './venueTypeMapping';

/**
 * Home and Settings off the wire: `GET /api/platform/overview`, `/outbox`,
 * `/activity` and `/me`. Every type is the generated one, so a field the
 * server renames fails the typecheck here rather than mapping nothing.
 */

type Schemas = components['schemas'];
type WireOverview = Schemas['Yalla.Application.Platform.PlatformOverview'];
type WireCounter = Schemas['Yalla.Application.Platform.OverviewVenueCounter'];
type WireOutbox = Schemas['Yalla.Application.Messaging.OutboxHealthView'];
type WireActivity = Schemas['Yalla.Application.Platform.ActivityFeed'];
type WireActivityEntry = Schemas['Yalla.Application.Platform.ActivityEntry'];
type WireProfile = Schemas['Yalla.Application.Platform.PlatformAdminProfile'];

function counter(wire: WireCounter): VenueCounter {
  return {
    total: wire.total,
    venues: wire.venues.map((venue) => ({
      venueId: venue.venueId,
      name: venue.name,
      count: venue.count,
    })),
  };
}

function outboxCounts(wire: OutboxCounts): OutboxCounts {
  return {
    pending: wire.pending,
    due: wire.due,
    failed: wire.failed,
    deadLettered: wire.deadLettered,
    sentLastDay: wire.sentLastDay,
    deadLetteredLastDay: wire.deadLetteredLastDay,
  };
}

export function overviewFromWire(wire: WireOverview): PlatformOverview {
  return {
    generatedAtUtc: wire.generatedAtUtc,
    venues: { ...wire.venues },
    bookings: {
      last7Days: wire.bookings.last7Days,
      previous7Days: wire.bookings.previous7Days,
      changePercent:
        typeof wire.bookings.changePercent === 'number' ? wire.bookings.changePercent : null,
      labelTimeZoneId: wire.bookings.labelTimeZoneId,
      perDay: wire.bookings.perDay.map((day) => ({ date: day.date, count: day.count })),
    },
    pendingApprovals: counter(wire.pendingApprovals),
    openTabs: counter(wire.openTabs),
    notReady: {
      total: wire.notReady.total,
      branches: wire.notReady.branches.map((branch) => ({
        venueId: branch.venueId,
        venueName: branch.venueName,
        branchId: branch.branchId,
        branchName: branch.branchName,
        issues: branch.issues.map((issue) => readinessIssueFromWire(issue)),
      })),
    },
    recentVenues: wire.recentVenues.map((venue) => ({
      id: venue.venueId,
      name: venue.name,
      slug: venue.slug,
      type: venueTypeFromCode(venue.type),
      status: venueStatusFromWire({
        status: venue.status,
        isDeleted: venue.status === 4,
        isSuspended: venue.status === 2,
      }),
      branchCount: venue.branchCount,
      createdAtUtc: venue.createdAtUtc,
    })),
    outbox: outboxCounts(wire.outbox),
  };
}

export function outboxHealthFromWire(wire: WireOutbox): OutboxHealth {
  return {
    ...outboxCounts(wire),
    deadLetters: wire.deadLetters.map((letter) => ({
      id: letter.id,
      type: letter.type,
      lastError: letter.lastError ?? null,
      attemptCount: letter.attemptCount,
      scheduledForUtc: letter.scheduledForUtc,
      deadLetteredAtUtc: letter.deadLetteredAtUtc ?? null,
    })),
  };
}

/** `StaffRole` on the wire: 5 is the platform admin; 0 is nobody. */
function actorRole(code: number | null | undefined): UserRole | null {
  if (code === null || code === undefined || code === 0) return null;
  return code === 5 ? 'platformAdmin' : staffRole(code);
}

/** The part of `detail` a sentence needs; the rest stays on the server. */
function detailNumber(detail: unknown, key: string): number | null {
  if (detail === null || typeof detail !== 'object') return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

/** A list member of `detail`, as the server wrote it; empty when absent. */
function detailList(detail: unknown, key: string): readonly unknown[] {
  if (detail === null || typeof detail !== 'object') return [];
  const value = (detail as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function detailFlag(detail: unknown, key: string): boolean {
  if (detail === null || typeof detail !== 'object') return false;
  return (detail as Record<string, unknown>)[key] === true;
}

export function activityEntryFromWire(wire: WireActivityEntry): PlatformActivityEntry {
  // `SubscriptionTier`, before 2026-10-27: 1 Free, 2 Paid.
  const to = wire.action === 'branch.tier-change' ? detailNumber(wire.detail, 'to') : null;
  const role = wire.action === 'staff.create' ? detailNumber(wire.detail, 'role') : null;
  return {
    id: wire.id,
    atUtc: wire.atUtc,
    action: wire.action,
    actor: {
      id: wire.actor.staffMemberId,
      role: actorRole(wire.actor.role),
      name: wire.actor.displayName ?? null,
    },
    target: { type: wire.target.type, id: wire.target.id, name: wire.target.displayName ?? null },
    venue: wire.venue ? { id: wire.venue.venueId, name: wire.venue.name } : null,
    tierTo: to === null ? null : to === 2 ? 'paid' : 'free',
    featuresChange:
      wire.action === 'branch.features-change'
        ? {
            added: branchFeaturesFromWire(detailList(wire.detail, 'added')),
            removed: branchFeaturesFromWire(detailList(wire.detail, 'removed')),
            viaVenue: detailFlag(wire.detail, 'viaVenue'),
          }
        : null,
    featuresApply:
      wire.action === 'venue.features-apply'
        ? {
            features: branchFeaturesFromWire(detailList(wire.detail, 'features')),
            branchCount: detailNumber(wire.detail, 'branchCount') ?? 0,
            changedCount: detailList(wire.detail, 'changedBranchIds').length,
          }
        : null,
    staffRole: role === null ? null : staffRole(role),
  };
}

export function activityFromWire(wire: WireActivity): readonly PlatformActivityEntry[] {
  return wire.items.map(activityEntryFromWire);
}

export function profileFromWire(wire: WireProfile): PlatformAdminProfile {
  return { staffMemberId: wire.staffMemberId, fullName: wire.fullName, email: wire.email };
}
