import { describe, expect, it } from 'vitest';
import { isTabManager } from './TabPanel';

/**
 * Who on the tablet gets the money controls — comp, void, adjust, take cash,
 * abandon. The server's `TabOrderService`, `TabPaymentService` and
 * `TableStateService` allow a branch manager, a general manager, an owner and
 * the platform tier; a waiter and the kitchen never.
 */
describe('the tab panel’s manager controls', () => {
  it('go to a general manager as well as a branch manager and an owner', () => {
    expect(isTabManager('generalManager')).toBe(true);
    expect(isTabManager('manager')).toBe(true);
    expect(isTabManager('owner')).toBe(true);
    expect(isTabManager('platformAdmin')).toBe(true);
  });

  it('never go to a waiter or the kitchen', () => {
    expect(isTabManager('waiter')).toBe(false);
    expect(isTabManager('kitchen')).toBe(false);
  });
});
