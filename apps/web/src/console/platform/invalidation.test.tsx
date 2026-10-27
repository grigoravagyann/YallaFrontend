// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import {
  GatewayProvider,
  queryKeys,
  useAddBranch,
  useCreateStaff,
  useDeleteTable,
  useDismissReviewReports,
  useRestoreVenue,
  useSaveBranchListing,
  useSaveFloorPlan,
  useSetReviewVisibility,
  useSetBranchFeatures,
  useSuspendVenue,
  useUpdateMenuItem,
  useVenueBookingsSummary,
} from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

/**
 * Every change a platform admin makes shows wherever it is shown (review
 * finding, 2026-10-18): Home's numbers and its activity feed, the venues list
 * and the venue page. A change that leaves one of them stale is a screen that
 * contradicts the one the person just left.
 */

const VENUE = 'v-cascade';
const BRANCH = 'b-cascade-center';

function setup(gateway: ConsoleGateway = createConsoleMockGateway({ latencyMs: 0 })) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  // Seed every view the change should leave stale, as if each had been visited.
  for (const key of [
    queryKeys.platformOverview,
    queryKeys.platformActivity({ limit: 8 }),
    queryKeys.allConsoleVenues,
    queryKeys.consoleVenue(VENUE),
  ]) {
    queryClient.setQueryData(key, { seeded: true });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <GatewayProvider consoleGateway={gateway}>{children}</GatewayProvider>
    </QueryClientProvider>
  );
  const stale = () => ({
    overview: queryClient.getQueryState(queryKeys.platformOverview)?.isInvalidated ?? false,
    activity:
      queryClient.getQueryState(queryKeys.platformActivity({ limit: 8 }))?.isInvalidated ?? false,
    list: queryClient.getQueryState(queryKeys.allConsoleVenues)?.isInvalidated ?? false,
    page: queryClient.getQueryState(queryKeys.consoleVenue(VENUE))?.isInvalidated ?? false,
  });
  return { wrapper, stale, queryClient };
}

const ALL = { overview: true, activity: true, list: true, page: true };

describe('a change reaches every view of it', () => {
  it('suspending a venue', async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useSuspendVenue(), { wrapper });
    await act(() => result.current.mutateAsync({ venueId: VENUE, commandId: 'c-1' }));
    // The venue page is replaced with the answer, so only the others need a refetch.
    expect({ ...stale(), page: true }).toEqual(ALL);
  });

  it('restoring a venue and adding a branch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const { wrapper, stale } = setup(gateway);
    const add = renderHook(() => useAddBranch(), { wrapper }).result;
    await act(() =>
      add.current.mutateAsync({
        venueId: VENUE,
        commandId: 'c-2',
        name: 'Arabkir',
        slug: 'arabkir',
        address: 'Komitas 32',
        latitude: 40.2,
        longitude: 44.5,
        timeZoneId: 'Asia/Yerevan',
      }),
    );
    expect(stale().overview && stale().activity && stale().list).toBe(true);
    const restore = renderHook(() => useRestoreVenue(), { wrapper }).result;
    await act(() =>
      restore.current.mutateAsync({ venueId: VENUE, commandId: 'c-3' }).catch(() => undefined),
    );
    expect(stale().overview && stale().activity).toBe(true);
  });

  it("switching a branch's features", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useSetBranchFeatures(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        branchId: 'b-sunset-north',
        features: ['appBookings', 'reviews'],
        commandId: 'c-4',
      }),
    );
    expect(stale().overview && stale().activity && stale().list).toBe(true);
  });

  it("saving a branch's listing, its rooms, a table and a dish", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const listing = await gateway.getBranchListing(BRANCH);
    const plan = await gateway.getFloorPlan(BRANCH);
    const menu = await gateway.getAdminMenu(BRANCH);
    const item = menu.flatMap((category) => category.items)[0]!;

    const saveListing = setup(gateway);
    const one = renderHook(() => useSaveBranchListing(BRANCH), { wrapper: saveListing.wrapper });
    await act(() =>
      one.result.current.mutateAsync({
        cuisine: 'Grill',
        about: listing.about,
        priceLevel: listing.priceLevel,
        websiteUrl: listing.websiteUrl,
        amenities: listing.amenities,
        galleryPhotoIds: null,
        address: listing.address,
        district: listing.district,
        latitude: listing.latitude,
        longitude: listing.longitude,
      }),
    );
    expect(saveListing.stale()).toEqual(ALL);

    const savePlan = setup(gateway);
    const two = renderHook(() => useSaveFloorPlan(), { wrapper: savePlan.wrapper });
    await act(() =>
      two.result.current.mutateAsync({
        branchId: BRANCH,
        command: {
          expectedVersion: plan.version,
          areas: plan.areas.map((area, index) => ({
            id: area.id,
            name: area.name,
            displayOrder: index,
            photoIds: area.photos.map((photo) => photo.photoId),
          })),
          tables: plan.tables.map((table) => ({
            id: table.id,
            label: table.label,
            seats: table.seats,
            floorAreaName: plan.areas.find((area) => area.id === table.floorAreaId)?.name ?? null,
            isBookable: table.isBookable,
            pin: table.pin,
          })),
        },
      }),
    );
    expect(savePlan.stale()).toEqual(ALL);

    const deleteTable = setup(gateway);
    const three = renderHook(() => useDeleteTable(BRANCH), { wrapper: deleteTable.wrapper });
    await act(() => three.result.current.mutateAsync(plan.tables[0]!.id).catch(() => undefined));
    await waitFor(() => expect(deleteTable.stale().list).toBe(true));
    expect(deleteTable.stale()).toEqual(ALL);

    const editDish = setup(gateway);
    const four = renderHook(() => useUpdateMenuItem(BRANCH), { wrapper: editDish.wrapper });
    await act(() =>
      four.result.current.mutateAsync({ itemId: item.id, patch: { name: `${item.name}!` } }),
    );
    expect(editDish.stale()).toEqual(ALL);
  });

  it('moderating a review, and adding a member of staff', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const hide = setup(gateway);
    const one = renderHook(() => useSetReviewVisibility(), { wrapper: hide.wrapper });
    await act(() =>
      one.result.current.mutateAsync({
        reviewId: 'review-seed-13',
        command: { hidden: true, reason: 'Advertising' },
      }),
    );
    expect(hide.stale()).toEqual(ALL);

    const dismiss = setup(gateway);
    const two = renderHook(() => useDismissReviewReports(), { wrapper: dismiss.wrapper });
    await act(() => two.result.current.mutateAsync('review-seed-12'));
    expect(dismiss.stale()).toEqual(ALL);

    const staff = setup(gateway);
    const three = renderHook(() => useCreateStaff(VENUE), { wrapper: staff.wrapper });
    await act(() =>
      three.result.current
        .mutateAsync({
          fullName: 'Mariam Avetisyan',
          role: 'manager',
          branchId: BRANCH,
          phone: '+37491000111',
          pin: '482913',
        })
        .catch(() => undefined),
    );
    expect(staff.stale().activity).toBe(true);
  });
});

describe("a venue's bookings", () => {
  it("never shows the venue before's numbers while another venue's load", async () => {
    let release: () => void = () => {};
    const mock = createConsoleMockGateway({ latencyMs: 0 });
    const slow: ConsoleGateway = {
      ...mock,
      getVenueBookingsSummary: async (input) =>
        input.venueId === 'v-sunset'
          ? new Promise((resolve) => {
              release = () => void mock.getVenueBookingsSummary(input).then(resolve);
            })
          : mock.getVenueBookingsSummary(input),
    };
    const { wrapper } = setup(slow);
    const { result, rerender } = renderHook(
      ({ venueId }: { venueId: string }) => useVenueBookingsSummary(venueId, 30),
      { wrapper, initialProps: { venueId: VENUE } },
    );
    await waitFor(() => expect(result.current.data?.venueId).toBe(VENUE));
    rerender({ venueId: 'v-sunset' });
    expect(result.current.data).toBeUndefined();
    act(() => release());
    await waitFor(() => expect(result.current.data?.venueId).toBe('v-sunset'));
  });
});
