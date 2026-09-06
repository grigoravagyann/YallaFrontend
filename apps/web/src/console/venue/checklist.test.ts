import { describe, expect, it } from 'vitest';
import { checklistSteps } from './OnboardingChecklist';

/**
 * The two lines nobody could satisfy.
 *
 * "Staff enrolled" and "at least one device" have sat on the branch readiness
 * checklist unlinked and permanently unticked since Backend Prompt 10, because
 * the screens that would satisfy them did not exist. A checklist that answers
 * "is this venue ready" with a row nobody can ever complete is worse than one
 * that omits it: it tells an owner the product is broken.
 */

const base = {
  tables: 12,
  unlabelled: 0,
  categories: [],
  week: [],
  hasPolicy: true,
  staffHere: 0,
  devicesHere: 0,
};

function step(id: string, over: Partial<typeof base>) {
  return checklistSteps({ ...base, ...over }).find((entry) => entry.id === id)!;
}

describe('the staff line', () => {
  it('is not done with nobody working the branch', () => {
    expect(step('staff', {}).done).toBe(false);
  });

  it('flips once somebody is assigned here', () => {
    const done = step('staff', { staffHere: 3 });
    expect(done.done).toBe(true);
    expect(done.detail).toBe('3');
  });

  it('links to the screen that satisfies it', () => {
    // It used to link nowhere, which is the part that made it unanswerable.
    expect(step('staff', {}).to).toBe('/venue/staff');
    expect(step('devices', {}).to).toBe('/venue/staff');
  });
});

describe('the device line', () => {
  it('is not done with no live tablet', () => {
    expect(step('devices', {}).done).toBe(false);
  });

  it('flips on a device that has not been revoked', () => {
    // A revoked tablet is not a tablet the counter can be run from, so the
    // caller filters those out before counting.
    expect(step('devices', { devicesHere: 1 }).done).toBe(true);
  });
});
