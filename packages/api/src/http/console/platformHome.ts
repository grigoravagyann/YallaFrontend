import type { ConsoleGateway } from '../../consoleGateway';
import type { components } from '../../generated/schema';
import { bookingBlockFromWire, type WireBookingBlock } from '../guestRecordMapping';
import {
  activityFromWire,
  outboxHealthFromWire,
  overviewFromWire,
  profileFromWire,
} from '../platformHomeMapping';
import { type ConsoleHttpContext, PLATFORM, tokenPairFrom } from './context';

type Schemas = components['schemas'];

/** Home shows the messages given up on in the last day; a few more than that is plenty. */
const OUTBOX_DEAD_LETTER_LIMIT = 20;

export function platformHomeMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'getPlatformOverview'
  | 'getOutboxHealth'
  | 'listBookingBlocks'
  | 'liftBookingBlock'
  | 'listPlatformActivity'
  | 'getPlatformProfile'
  | 'updatePlatformProfile'
  | 'changePlatformPassword'
> {
  const { client, auth } = ctx;
  return {
    // --- Home and Settings --------------------------------------------------

    async getPlatformOverview() {
      const { data } = await client.get<Schemas['Yalla.Application.Platform.PlatformOverview']>(
        `${PLATFORM}/overview`,
      );
      return overviewFromWire(data);
    },

    async getOutboxHealth() {
      const { data } = await client.get<Schemas['Yalla.Application.Messaging.OutboxHealthView']>(
        `${PLATFORM}/outbox`,
        { query: { deadLetterLimit: OUTBOX_DEAD_LETTER_LIMIT } },
      );
      return outboxHealthFromWire(data);
    },

    async listBookingBlocks() {
      const { data } = await client.get<readonly WireBookingBlock[]>(`${PLATFORM}/booking-blocks`);
      return (data ?? []).map(bookingBlockFromWire);
    },

    async liftBookingBlock({ blockId, reason }) {
      const { data } = await client.post<WireBookingBlock>(
        `${PLATFORM}/booking-blocks/${encodeURIComponent(blockId)}/lift`,
        { reason: reason.trim() } satisfies Schemas['Yalla.Api.Endpoints.LiftBookingBlockRequest'],
      );
      return bookingBlockFromWire(data);
    },

    async listPlatformActivity(query = {}) {
      const { data } = await client.get<Schemas['Yalla.Application.Platform.ActivityFeed']>(
        `${PLATFORM}/activity`,
        {
          query: {
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.venueId ? { venueId: query.venueId } : {}),
          },
        },
      );
      return activityFromWire(data);
    },

    async getPlatformProfile() {
      const { data } = await client.get<Schemas['Yalla.Application.Platform.PlatformAdminProfile']>(
        `${PLATFORM}/me`,
      );
      return profileFromWire(data);
    },

    async updatePlatformProfile({ fullName }) {
      const { data } = await client.patch<
        Schemas['Yalla.Application.Platform.PlatformAdminProfile']
      >(`${PLATFORM}/me`, { fullName });
      return profileFromWire(data);
    },

    async changePlatformPassword({ currentPassword, newPassword }) {
      // A wrong current password is a 422 naming `currentPassword`, not a
      // 401: the session stays, and the form shows it under the field.
      const { data } = await client.post<unknown>(`${PLATFORM}/me/password`, {
        currentPassword,
        newPassword,
      });
      // The server ends every other session (a session generation that every
      // other access token is checked against) and answers with a fresh pair
      // for this one, shaped like the sign-in answer. Adopted here, through the
      // session the console already holds, so this tab stays signed in. A 204
      // renews nothing, and nothing is claimed.
      const pair = tokenPairFrom(data);
      if (!pair) return { sessionRenewed: false };
      await auth.signIn(pair);
      return { sessionRenewed: true };
    },
  };
}
