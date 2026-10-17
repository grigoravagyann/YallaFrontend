import * as Haptics from 'expo-haptics';

/**
 * The three touches the app gives back, and nothing more.
 *
 * Kept to moments that change something real: choosing a table, a booking or
 * a payment going through, a waiter being called. A buzz on every tap teaches
 * the hand to ignore it. Every call is fire-and-forget — a phone without a
 * vibration motor, or with system haptics turned off, simply stays still.
 *
 * `haptics.web.ts` is the browser twin: the same names, doing nothing.
 */
export const haptics = {
  /** A choice among several — a table on the room photo, a time slot. */
  select(): void {
    void Haptics.selectionAsync().catch(() => undefined);
  },
  /** Something went through: a booking confirmed, the bill settled. */
  success(): void {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  /** A light tap of acknowledgement — a waiter call sent, a favourite saved. */
  tap(): void {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
};
