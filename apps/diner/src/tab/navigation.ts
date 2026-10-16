import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Back to the tab screen from anywhere under it — the menu, the tray, an order
 * just sent.
 *
 * `dismissTo` unwinds to the tab screen already in the stack, so the tab's own
 * back arrow leaves the tab instead of leading into the menu again; reached
 * from a link with no tab screen underneath, it replaces the current screen.
 */
export function returnToTab(router: Pick<Router, 'dismissTo'>, tabId: string): void {
  router.dismissTo({ pathname: '/tab/[tabId]', params: { tabId } });
}
