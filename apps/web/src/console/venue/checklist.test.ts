import type { BranchReadiness } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { checklistSteps, readinessBlockers } from './OnboardingChecklist';

/**
 * The checklist renders the server's readiness answer and decides nothing.
 *
 * These pin the mapping: each line is the server's boolean, the counts beside
 * it are the server's counts, every line links to the screen that finishes it,
 * and the booking switch is reported without counting against "ready".
 */

const READY: BranchReadiness = {
  branchId: 'b-1',
  isReadyForDiners: true,
  floorPlanDrawn: true,
  tableCount: 12,
  tablesLabelled: true,
  menuCategoriesPresent: true,
  menuCategoryCount: 3,
  menuItemCount: 20,
  menuComplete: true,
  incompleteMenuItemCount: 0,
  incompleteMenuItemIds: [],
  openingHoursSet: true,
  openingHoursDayCount: 6,
  reservationPolicyReviewed: true,
  staffEnrolled: true,
  staffCount: 4,
  deviceEnrolled: true,
  deviceCount: 1,
  acceptsWebBookings: false,
  blockers: [],
};

function step(id: string, over: Partial<BranchReadiness> = {}) {
  return checklistSteps({ ...READY, ...over }).find((entry) => entry.id === id)!;
}

describe('the checklist lines', () => {
  it('takes "policy reviewed" from the server, not from a policy existing', () => {
    // Every branch has a default policy, so "a policy loads" was true for all
    // of them. Only the server knows whether somebody saved one.
    expect(step('policy', { reservationPolicyReviewed: false }).done).toBe(false);
    expect(step('policy').done).toBe(true);
  });

  it("shows the server's counts beside the lines", () => {
    expect(step('floorPlan').detail).toBe('12');
    expect(step('staff').detail).toBe('4');
    expect(step('hours').detail).toBe('6');
    // Unfinished dishes are the number that matters while there are any.
    expect(step('menuItems', { menuComplete: false, incompleteMenuItemCount: 3 }).detail).toBe('3');
  });

  it('links every line to the screen that satisfies it', () => {
    const links = Object.fromEntries(checklistSteps(READY).map((entry) => [entry.id, entry.to]));
    expect(links).toEqual({
      floorPlan: '/venue/floorplan',
      tableLabels: '/venue/floorplan',
      menuCategories: '/venue/menu',
      menuItems: '/venue/menu',
      hours: '/venue/hours',
      policy: '/venue/policy',
      staff: '/venue/staff',
      devices: '/venue/staff',
      acceptsWebBookings: '/venue/public',
    });
  });

  it('reports the booking switch as optional', () => {
    const bookings = step('acceptsWebBookings');
    expect(bookings.optional).toBe(true);
    expect(bookings.done).toBe(false);
    expect(checklistSteps(READY).filter((entry) => entry.optional)).toHaveLength(1);
  });
});

describe('what stops diners', () => {
  it('is nothing for a ready branch, whatever the booking switch says', () => {
    expect(readinessBlockers(READY)).toEqual([]);
  });

  it('names each gap once, in the server order, with the unfinished dish count', () => {
    expect(
      readinessBlockers({
        ...READY,
        isReadyForDiners: false,
        tablesLabelled: false,
        menuComplete: false,
        incompleteMenuItemCount: 2,
        reservationPolicyReviewed: false,
        deviceEnrolled: false,
        deviceCount: 0,
      }),
    ).toEqual([
      { key: 'tablesUnlabelled' },
      { key: 'menuIncomplete', count: 2 },
      { key: 'policyNotReviewed' },
      { key: 'noDevice' },
    ]);
  });

  it('says the plan is empty rather than unlabelled when there are no tables', () => {
    const keys = readinessBlockers({
      ...READY,
      floorPlanDrawn: false,
      tablesLabelled: false,
      tableCount: 0,
    }).map((blocker) => blocker.key);
    expect(keys).toEqual(['floorPlanEmpty']);
  });
});
