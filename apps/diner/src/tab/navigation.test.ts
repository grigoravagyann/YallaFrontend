import { describe, expect, it, vi } from 'vitest';
import { returnToTab } from './navigation';

/**
 * "Back to tab" after sending an order used to put a second tab screen on top
 * of the menu, so the tab's own back arrow led into the menu again. Going back
 * to the tab now unwinds to the tab screen already underneath.
 */
describe('going back to the tab', () => {
  it('unwinds to the tab screen rather than stacking another one', () => {
    const router = { dismissTo: vi.fn(), push: vi.fn(), replace: vi.fn() };

    returnToTab(router, 'tab-1');

    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/tab/[tabId]',
      params: { tabId: 'tab-1' },
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
