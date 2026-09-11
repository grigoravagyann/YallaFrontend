import { describe, expect, it } from 'vitest';
import { assignableRoles } from './staff';

/**
 * Regression: ISSUE-103 — a venue could be created and never handed to anybody
 * Found by /qa on 2026-09-07
 * Report: .gstack/qa-reports/qa-report-localhost-5173-2026-09-07.md
 *
 * A platform admin is the only actor who can give a venue its first owner: a
 * new venue has nobody in it, so there is no owner to add a co-owner. The
 * picker offered them `manager` at best, so the venue-detail screen could hire
 * a manager into a venue that had no owner at all. The server allowed the
 * assignment the whole time — this list was the stricter of the two.
 */
describe('a platform admin assigning the first owner', () => {
  it('is offered owner, which no manager is', () => {
    // An owner is offered owner too — a co-owner — but a brand new venue has no
    // owner yet, so the platform admin is still the only one who can seed it.
    expect(assignableRoles('platformAdmin')).toContain('owner');
    expect(assignableRoles('manager')).not.toContain('owner');
  });

  it('is offered every role below the platform, in rank order', () => {
    expect(assignableRoles('platformAdmin')).toEqual(['owner', 'manager', 'waiter', 'kitchen']);
  });

  it('still cannot mint another platform admin from a venue screen', () => {
    expect(assignableRoles('platformAdmin')).not.toContain('platformAdmin' as never);
  });
});
