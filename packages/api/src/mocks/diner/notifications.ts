import { type DinerMockContext, type MockGateway } from './context';

/** The notifications feed and push registration. */
export function notificationsMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'listNotifications'
  | 'getUnreadNotificationCount'
  | 'markNotificationsRead'
  | 'registerPushDevice'
> {
  const { feedOf, me, notificationPage, pushDevices, wait } = ctx;
  return {
    // --- The notifications feed (K12) --------------------------------------------

    async listNotifications(query) {
      await wait();
      return notificationPage(me(), query);
    },

    async getUnreadNotificationCount() {
      await wait();
      return notificationPage(me(), { limit: 1 }).unreadCount;
    },

    async markNotificationsRead(command) {
      await wait();
      const feed = feedOf(me());
      if (command.upTo !== undefined) {
        const index = feed.findIndex((row) => row.notificationId === command.upTo);
        // Everything up to it is everything at it and older; the feed is newest first.
        if (index >= 0) {
          for (let i = index; i < feed.length; i += 1) feed[i] = { ...feed[i]!, read: true };
        }
        return;
      }
      // Ids that are not this diner's are ignored, never revealed.
      const ids = new Set(command.ids ?? []);
      for (let i = 0; i < feed.length; i += 1) {
        if (ids.has(feed[i]!.notificationId)) feed[i] = { ...feed[i]!, read: true };
      }
    },

    // --- Notifications --------------------------------------------------------
    //
    // The mock has no push channel and cannot pretend to: a token it accepted
    // would never receive anything. What it *can* do honestly is behave like the
    // registration endpoint and hold reservation state, so the routing, the
    // stale-action rule and the one-extension rule are all walkable without a
    // phone in your hand.

    async registerPushDevice({ pushToken }) {
      await wait();
      // Idempotent on the token, as the server is: the app calls this on every
      // launch and on rotation.
      let deviceId = pushDevices.get(pushToken);
      if (!deviceId) {
        deviceId = `device-${pushDevices.size + 1}`;
        pushDevices.set(pushToken, deviceId);
      }
      return { deviceId };
    },
  };
}
