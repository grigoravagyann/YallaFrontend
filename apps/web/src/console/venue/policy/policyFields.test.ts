import { ApiError, PolicyBoundsError, defaultPolicyFor } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  POLICY_FIELDS,
  POLICY_GROUPS,
  differsFromDefaults,
  fieldsInGroup,
  isDefault,
  outOfBounds,
  refusalFor,
} from './policyFields';

/**
 * The reservation policy form.
 *
 * The behaviour under test is where a refusal *lands*. The server refuses an
 * out-of-range value rather than clamping it — a number silently corrected to
 * something the owner did not choose is worse than a refusal — and names the
 * field in prose. If that prose ends up as a red sentence above a form of
 * fourteen numbers, the owner has to guess which one, and on this screen
 * guessing wrong changes how the venue takes bookings.
 */

describe('a bounds rejection from the server', () => {
  it('lands against the field it is about, not on the form', () => {
    const refusal = refusalFor(
      new PolicyBoundsError({
        url: '/api/branches/b1/reservation-policy',
        // As the gateway resolved it from the server's own sentence.
        field: 'turnTimeMinutes',
        detail: 'Turn time must be between 15 and 360 minutes; 5 minutes was given.',
      }),
    );

    expect(refusal).not.toBeNull();
    expect(refusal?.field).toBe('turnTimeMinutes');
    // The server's own sentence, verbatim. It already contains the bounds and
    // the value given, which is more than the client knows how to say.
    expect(refusal?.message).toContain('between 15 and 360');
  });

  it('falls back to form level rather than losing a message it cannot place', () => {
    const refusal = refusalFor(
      new PolicyBoundsError({
        url: '/api/branches/b1/reservation-policy',
        field: null,
        detail: 'Something the client has never heard of was rejected.',
      }),
    );

    // Wrong-looking, and never silent. A refusal swallowed because the mapping
    // missed is a save button that does nothing.
    expect(refusal?.field).toBeNull();
    expect(refusal?.message).toBe('Something the client has never heard of was rejected.');
  });

  it('is not produced for an error that is not a bounds refusal', () => {
    expect(refusalFor(new ApiError('offline', { status: 0, url: '' }))).toBeNull();
    expect(refusalFor(null)).toBeNull();
  });
});

describe('the local bounds check', () => {
  it('marks a value the server would refuse', () => {
    const policy = { ...defaultPolicyFor('cafe'), turnTimeMinutes: 5, bookingWindowDays: 400 };
    expect(outOfBounds(policy)).toEqual(['bookingWindowDays', 'turnTimeMinutes']);
  });

  it('marks nothing on the shipped defaults', () => {
    expect(outOfBounds(defaultPolicyFor('cafe'))).toEqual([]);
    expect(outOfBounds(defaultPolicyFor('restaurant'))).toEqual([]);
  });
});

describe('the shipped defaults', () => {
  it('differ between a cafe and a restaurant in exactly the turn time', () => {
    const cafe = defaultPolicyFor('cafe');
    const restaurant = defaultPolicyFor('restaurant');

    expect(cafe.turnTimeMinutes).toBe(120);
    expect(restaurant.turnTimeMinutes).toBe(90);

    const differing = Object.keys(cafe).filter(
      (key) => cafe[key as keyof typeof cafe] !== restaurant[key as keyof typeof restaurant],
    );
    expect(differing).toEqual(['turnTimeMinutes']);
  });

  it('give a reset target for every field, and say which have been changed', () => {
    const changed = { ...defaultPolicyFor('cafe'), turnTimeMinutes: 45, bufferMinutes: 0 };

    expect(isDefault(changed, 'turnTimeMinutes', 'cafe')).toBe(false);
    expect(isDefault(changed, 'graceMinutes', 'cafe')).toBe(true);
    expect(differsFromDefaults(changed, 'cafe')).toEqual(['turnTimeMinutes', 'bufferMinutes']);
  });
});

describe('the form layout', () => {
  it('puts every field in exactly one group', () => {
    const grouped = POLICY_GROUPS.flatMap((group) => fieldsInGroup(group));
    expect(grouped).toHaveLength(POLICY_FIELDS.length);
    expect(new Set(grouped.map((field) => field.key)).size).toBe(POLICY_FIELDS.length);
  });

  it('covers every field of the policy, so nothing is uneditable', () => {
    // A field the screen forgot is a setting that can only be changed by
    // inserting a row by hand, which is the state this whole prompt exists to
    // get out of.
    const shipped = Object.keys(defaultPolicyFor('cafe')).sort();
    const editable = POLICY_FIELDS.map((field) => field.key as string).sort();
    expect(editable).toEqual(shipped);
  });
});
