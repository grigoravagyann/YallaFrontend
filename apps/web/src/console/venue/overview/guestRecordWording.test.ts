import { resources } from '@yalla/i18n/resources';
import { describe, expect, it } from 'vitest';

/**
 * The guest record's Armenian words (review round 2, 2026-10-21): the app
 * calls a venue «վայր» everywhere, so the record's label and the copy around
 * it never say «հաստատություն» — which also reads as "confirmation" beside
 * «հաստատել» on the same screens.
 */

const INSTITUTION = /աստատությ/iu;

describe('the guest record in Armenian', () => {
  it('labels the counts as counted at every venue, «բոլոր վայրերում»', () => {
    for (const label of [
      resources.hy.admin.guestRecord.label,
      resources.hy.staff.guestRecord.label,
    ]) {
      expect(label).toContain('բոլոր վայրերում');
      expect(label).not.toMatch(INSTITUTION);
    }
  });

  it('never calls the venue «հաստատություն» in the copy around it', () => {
    const admin = resources.hy.admin;
    for (const text of [
      admin.policy.field.autoConfirmGuestsWithGoodRecord.why,
      admin.policy.inactive.autoConfirmOn,
      admin.home.blocks.cap,
    ]) {
      expect(text).not.toMatch(INSTITUTION);
    }
  });
});
