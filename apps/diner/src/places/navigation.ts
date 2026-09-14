import type { Place } from './model';

/**
 * The route parameters that carry a place from its page to the floor plan.
 *
 * The floor plan asks the branch's public page for its booking window and lead
 * time, and that page is addressed by **slugs** — `lumen-coffee/cascade` — not
 * by ids. It used to be handed the venue's id and the branch's slug, so every
 * real branch answered "no such page" and the pickers fell back to defaults
 * while the server refused what they offered. Everything the next screen needs
 * travels here, so it does not have to read the venue again to learn it.
 */
export type FloorPlanParams = {
  branchId: string;
  venueId: string;
  venueSlug: string;
  branchSlug: string;
  venueName: string;
  branchName: string;
  timeZoneId: string;
};

export function floorPlanParams(
  place: Pick<
    Place,
    'id' | 'venueId' | 'venueSlug' | 'branchSlug' | 'venueName' | 'branchName' | 'timeZoneId'
  >,
): FloorPlanParams {
  return {
    branchId: place.id,
    venueId: place.venueId,
    venueSlug: place.venueSlug,
    branchSlug: place.branchSlug,
    venueName: place.venueName,
    branchName: place.branchName,
    timeZoneId: place.timeZoneId,
  };
}

/** Ids on the real backend are GUIDs. A slug is lowercase words and hyphens, never one of these. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The slugs to read booking rules with, or `null` when there are none worth
 * asking with.
 *
 * A GUID where a slug belongs is refused here rather than sent: the answer
 * would be a 404 read as "this branch has no rules", which is the bug this
 * exists to stop coming back. `null` means the pickers use their defaults and
 * the server still refuses anything outside the real window, with its reason.
 */
export function bookingRulesInput(params: {
  readonly venueSlug?: string | undefined;
  readonly branchSlug?: string | undefined;
}): { venueSlug: string; branchSlug: string } | null {
  const venueSlug = params.venueSlug?.trim() ?? '';
  const branchSlug = params.branchSlug?.trim() ?? '';
  if (venueSlug === '' || branchSlug === '') return null;
  if (GUID.test(venueSlug) || GUID.test(branchSlug)) return null;
  return { venueSlug, branchSlug };
}
