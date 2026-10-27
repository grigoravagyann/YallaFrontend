import type {
  ListVenuesQuery,
  Page,
  ConsoleVenue,
  CreateVenueCommand,
} from '../../contracts/console';
import { ForbiddenError } from '../../errors';
import { SlugTakenError, VenueDeletionBlockedError } from '../../contracts/errors';
import { BASIC_FEATURES } from '../../contracts/branchFeatures';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, DEFAULT_PAGE_SIZE, URL_TAG, type VenueRecord } from './context';

/** The console's venues: the signed-in user, the list, a venue, and every platform command on one. */
export function venuesMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'getCurrentUser'
  | 'listVenues'
  | 'getVenue'
  | 'getManagedVenue'
  | 'createVenue'
  | 'updateVenue'
  | 'addBranch'
  | 'suspendVenue'
  | 'resumeVenue'
  | 'deleteVenue'
  | 'getVenueBookingsSummary'
  | 'restoreVenue'
> {
  const {
    bookings,
    bookingsSummaryFor,
    branchSlugs,
    conflict,
    currentUser,
    log,
    managedVenueFor,
    now,
    requireVenue,
    role,
    seedBookings,
    slugOf,
    toDetail,
    toRow,
    venues,
    wait,
  } = ctx;
  return {
    async getCurrentUser() {
      await wait();
      return currentUser();
    },

    async listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>> {
      await wait();
      const needle = query.search?.trim().toLocaleLowerCase() ?? '';
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);

      const matching = [...venues.values()]
        .filter((record) => query.includeDeleted || record.status !== 'deleted')
        .filter(
          (record) =>
            !needle ||
            record.name.toLocaleLowerCase().includes(needle) ||
            record.slug.includes(needle),
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      const start = (page - 1) * pageSize;
      return {
        items: matching.slice(start, start + pageSize).map(toRow),
        total: matching.length,
        page,
        pageSize,
      };
    },

    async getVenue(venueId) {
      await wait();
      // `PlatformAdminOnly`: the real route answers every venue user 403, and
      // a mock that answered them is how the console shipped reading its
      // branches from a route its users cannot call.
      if (role !== 'platformAdmin') {
        throw new ForbiddenError({ url: `${URL_TAG}/platform/venues/${venueId}` });
      }
      const record = venues.get(venueId);
      return record ? toDetail(record) : null;
    },

    async getManagedVenue(venueId) {
      await wait();
      return managedVenueFor(venueId);
    },

    async createVenue(command: CreateVenueCommand) {
      await wait();

      const slug = command.slug.trim().toLocaleLowerCase();
      if ([...venues.values()].some((record) => record.slug === slug)) {
        throw new SlugTakenError({ url: URL_TAG, slug });
      }

      ctx.sequence += 1;
      const venueId = `v-new-${ctx.sequence}`;
      const branchId = `${venueId}-b1`;
      const branchSlug = command.firstBranch.slug.trim().toLocaleLowerCase();
      if (branchSlug) branchSlugs.set(branchId, branchSlug);

      const record: VenueRecord = {
        id: venueId,
        name: command.name.trim(),
        slug,
        type: command.type,
        status: 'active',
        createdAtUtc: now().toISOString(),
        suspendedAtUtc: null,
        branches: [
          {
            id: branchId,
            venueId,
            name: command.firstBranch.name.trim(),
            timeZoneId: command.firstBranch.timeZoneId,
            // A new venue has no floor plan yet — the team draws it during
            // onboarding, which is exactly the next task.
            tableCount: 0,
            // A new branch starts on Basic: everything but table service.
            features: BASIC_FEATURES,
            openTabCount: 0,
          },
        ],
        staff: [],
      };

      venues.set(venueId, record);
      log('venue.create', { type: 'Venue', id: venueId, name: record.name }, record);
      return toDetail(record);
    },

    async updateVenue({ venueId, name, slug, type }) {
      await wait();
      const record = requireVenue(venueId);
      const wanted = slug.trim().toLocaleLowerCase();
      if ([...venues.values()].some((other) => other.id !== venueId && other.slug === wanted)) {
        throw new SlugTakenError({ url: URL_TAG, slug: wanted });
      }
      record.name = name.trim();
      record.slug = wanted;
      record.type = type;
      log('venue.update', { type: 'Venue', id: record.id, name: record.name }, record);
      return toDetail(record);
    },

    async addBranch(command) {
      await wait();
      const record = requireVenue(command.venueId);
      // The record keeps no branch slug; the managed view derives one from the
      // name, so the same derivation is the collision the server would refuse.
      const wanted = command.slug.trim().toLocaleLowerCase();
      if (record.branches.some((branch) => slugOf(branch) === wanted)) {
        throw new SlugTakenError({ url: URL_TAG, slug: wanted });
      }
      ctx.sequence += 1;
      branchSlugs.set(`${record.id}-b${ctx.sequence}`, wanted);
      record.branches.push({
        id: `${record.id}-b${ctx.sequence}`,
        venueId: record.id,
        name: command.name.trim(),
        timeZoneId: command.timeZoneId,
        tableCount: 0,
        features: BASIC_FEATURES,
        openTabCount: 0,
      });
      log(
        'branch.create',
        { type: 'Branch', id: `${record.id}-b${ctx.sequence}`, name: command.name.trim() },
        record,
      );
      return toDetail(record);
    },

    async suspendVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);
      record.status = 'suspended';
      record.suspendedAtUtc = now().toISOString();
      log('venue.suspend', { type: 'Venue', id: record.id, name: record.name }, record);
      return toDetail(record);
    },

    async resumeVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);
      // `Venue.Reactivate`: refused once deleted, and it only lifts a suspension.
      if (record.status === 'deleted') {
        throw conflict(`Venue '${record.name}' has been deleted, so it can no longer be changed.`);
      }
      if (record.status === 'suspended') {
        record.status = record.switchedOff ? 'inactive' : 'active';
      }
      record.suspendedAtUtc = null;
      log('venue.reactivate', { type: 'Venue', id: record.id, name: record.name }, record);
      return toDetail(record);
    },

    async deleteVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);

      // PlatformService.DeleteVenueAsync: refused while a table has an open
      // tab or a confirmed/pending booking has not started yet, with the
      // labels and codes in the 409's context and this sentence.
      // The mock always knows its own tab counts, so a null here would be a
      // bug in the fixture rather than a source that did not report them.
      const openTables = record.branches.flatMap((branch) =>
        Array.from({ length: branch.openTabCount ?? 0 }, (_, i) => String(i + 7)),
      );
      seedBookings();
      const branchIds = new Set(record.branches.map((branch) => branch.id));
      const today = now().toISOString().slice(0, 10);
      const futureBookings = [...bookings.values()]
        .filter(
          (booking) =>
            branchIds.has(booking.branchId) &&
            (booking.status === 'confirmed' || booking.status === 'pendingApproval') &&
            booking.localDate >= today,
        )
        .map((booking) => booking.code);
      if (openTables.length > 0 || futureBookings.length > 0) {
        const parts: string[] = [];
        if (openTables.length > 0) {
          parts.push(`${openTables.length} open tab(s) on table(s) ${openTables.join(', ')}`);
        }
        if (futureBookings.length > 0) {
          parts.push(
            `${futureBookings.length} future confirmed reservation(s) (${futureBookings.join(', ')})`,
          );
        }
        throw new VenueDeletionBlockedError({
          url: URL_TAG,
          venueId,
          openTables,
          futureBookings,
          message: `This venue cannot be deleted: it has ${parts.join(' and ')}. Suspend it instead, or wait for them to close.`,
        });
      }

      record.status = 'deleted';
      log('venue.delete', { type: 'Venue', id: record.id, name: record.name }, record);
      return toDetail(record);
    },

    async getVenueBookingsSummary({ venueId, days }) {
      await wait();
      // PlatformAdminOnly, like every `/api/platform` read.
      if (role !== 'platformAdmin') {
        throw new ForbiddenError({ url: `${URL_TAG}/platform/venues/${venueId}/bookings-summary` });
      }
      return bookingsSummaryFor(requireVenue(venueId), days);
    },

    async restoreVenue({ venueId }) {
      await wait();
      if (role !== 'platformAdmin') {
        throw new ForbiddenError({ url: `${URL_TAG}/platform/venues/${venueId}/restore` });
      }
      const record = requireVenue(venueId);
      // `PlatformService.RestoreVenueAsync`: a venue that is not deleted is
      // answered as it is (an Undo pressed twice is not an error).
      if (record.status !== 'deleted') return toDetail(record);
      // A venue suspended before it was deleted comes back suspended.
      record.status = record.suspendedAtUtc
        ? 'suspended'
        : record.switchedOff
          ? 'inactive'
          : 'active';
      log('venue.restore', { type: 'Venue', id: record.id, name: record.name }, record);
      return toDetail(record);
    },
  };
}
