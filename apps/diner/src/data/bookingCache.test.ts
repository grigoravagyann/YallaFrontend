import { QueryClient } from '@tanstack/react-query';
import { createMockGateway } from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { describe, expect, it } from 'vitest';
import { refreshRoomAfterLoss } from './bookingCache';

const BRANCH = 'b-lumen-north';
const ZONE = 'Asia/Yerevan';

describe('losing the race for a table', () => {
  it('invalidates the slot floor the branch screen is drawing', async () => {
    const now = new Date('2026-09-16T10:00:00Z');
    const gateway = createMockGateway({ now: () => now, simulateTableTaken: true });
    const slotUtc = '2026-09-16T15:00:00.000Z';
    const queryClient = new QueryClient();

    // The room as the branch screen drew it.
    const room = await gateway.getSlotFloor({ branchId: BRANCH, slotUtc, partySize: 2 });
    const key = queryKeys.slotFloor(BRANCH, slotUtc, 2, ZONE);
    queryClient.setQueryData(key, room);

    // The mock loses the race exactly as the server's 409 does.
    const table = room?.tables.find((entry) => entry.isBookable);
    const lost = await gateway
      .createBooking({
        commandId: 'cmd-race',
        branchId: BRANCH,
        tableId: table!.tableId,
        slotUtc,
        timeZoneId: ZONE,
        partySize: 2,
        guestName: 'Ani',
        guestPhone: '+37477123456',
        channel: 'app',
      })
      .then(
        () => null,
        (error: unknown) => error as { name: string },
      );
    expect(lost?.name).toBe('TableTakenError');

    await refreshRoomAfterLoss(queryClient, BRANCH);

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
