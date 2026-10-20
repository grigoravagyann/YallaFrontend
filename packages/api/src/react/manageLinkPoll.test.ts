import { describe, expect, it } from 'vitest';
import { MANAGE_LINK_POLL_MS, MANAGE_LINK_SLOW_POLL_MS, manageLinkPollMs } from './index';

/**
 * How often a manage link reads itself again (PP5-FE-REVIEW S2): within its
 * 20-a-minute budget per link, shared by every tab holding it.
 */
describe('the manage link poll', () => {
  const at = (status: string, approvalExpiresAtUtc: string | null) => ({
    status,
    approvalExpiresAtUtc,
  });

  it('reads every 15 s while a request waits with a clock', () => {
    expect(manageLinkPollMs(at('pendingApproval', '2026-10-20T10:15:00Z'))).toBe(
      MANAGE_LINK_POLL_MS,
    );
    expect(MANAGE_LINK_POLL_MS).toBe(15_000);
  });

  it('reads once a minute while the answer is hours away (UG review S8)', () => {
    const now = Date.parse('2026-10-20T10:00:00Z');
    expect(manageLinkPollMs(at('pendingApproval', '2026-10-21T08:00:00Z'), now)).toBe(
      MANAGE_LINK_SLOW_POLL_MS,
    );
    expect(manageLinkPollMs(at('pendingApproval', '2026-10-20T10:50:00Z'), now)).toBe(
      MANAGE_LINK_POLL_MS,
    );
  });

  it('still reads, once a minute, while a request waits with no clock', () => {
    expect(manageLinkPollMs(at('pendingApproval', null))).toBe(MANAGE_LINK_SLOW_POLL_MS);
    expect(MANAGE_LINK_SLOW_POLL_MS).toBe(60_000);
  });

  it('stops once decided, and for no booking', () => {
    for (const status of ['confirmed', 'cancelled', 'completed', 'noShow']) {
      expect(manageLinkPollMs(at(status, null))).toBe(false);
    }
    expect(manageLinkPollMs(null)).toBe(false);
  });
});
