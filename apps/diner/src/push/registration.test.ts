import {
  VENUE_ASK_BUTTONS_PUSH_CATEGORY,
  VENUE_ASK_PUSH_CATEGORY,
  VENUE_MESSAGE_PUSH_CATEGORIES,
  VENUE_MESSAGE_PUSH_CATEGORY,
  VENUE_MESSAGE_READONLY_PUSH_CATEGORY,
} from '@yalla/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUSH_ACTIONS } from './payload';
import { registerCategories } from './registration';

/**
 * The venue's message carries one of four categories (2026-10-24): with a
 * typed Reply while the venue takes guest texts, without it while it does
 * not. All four must be registered, or the push comes with no buttons.
 */

const notifications = vi.hoisted(() => ({
  setNotificationCategoryAsync: vi.fn(async () => null),
}));

vi.mock('expo-notifications', () => notifications);
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const LABELS = {
  cancel: 'cancel',
  extendHold: 'extend',
  tableRequestYes: 'yes',
  tableRequestNo: 'no',
  onMyWay: 'on my way',
  cantCome: "can't come",
  venueComing: "I'm coming",
  venueLate15: 'Late 15 min',
  venueReply: 'Reply',
  venueReplyPlaceholder: 'Message',
  venueReplySend: 'Send',
};

function actionsOf(category: string): string[] {
  const call = notifications.setNotificationCategoryAsync.mock.calls.find(
    (args: unknown[]) => args[0] === category,
  ) as [string, { identifier: string }[]] | undefined;
  if (!call) throw new Error(`${category} was not registered`);
  return call[1].map((action) => action.identifier);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('registerCategories — the venue-message categories', () => {
  it('registers all four, each with its own buttons', async () => {
    await registerCategories(LABELS);

    for (const category of VENUE_MESSAGE_PUSH_CATEGORIES) actionsOf(category);
    expect(actionsOf(VENUE_ASK_PUSH_CATEGORY)).toEqual([
      PUSH_ACTIONS.venueComing,
      PUSH_ACTIONS.venueLate15,
      PUSH_ACTIONS.venueReply,
    ]);
    expect(actionsOf(VENUE_ASK_BUTTONS_PUSH_CATEGORY)).toEqual([
      PUSH_ACTIONS.venueComing,
      PUSH_ACTIONS.venueLate15,
    ]);
    expect(actionsOf(VENUE_MESSAGE_PUSH_CATEGORY)).toEqual([PUSH_ACTIONS.venueReply]);
    expect(actionsOf(VENUE_MESSAGE_READONLY_PUSH_CATEGORY)).toEqual([]);
  });
});
