import { describe, expect, it } from 'vitest';
import { isTabManager } from './TabPanel';

/**
 * Who on the tablet gets the manager controls — comp a line, % or an amount off
 * the whole tab, mark it unpaid (HANDOFF §3). The server's `TabOrderService`,
 * `TabPaymentService` and `TableStateService` allow those to a branch manager,
 * a general manager, an owner and the platform tier; a waiter and the kitchen
 * never. Voiding a line and taking cash are every waiter's, and are not gated
 * by this.
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
