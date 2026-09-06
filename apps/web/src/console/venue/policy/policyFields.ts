import {
  POLICY_BOUNDS,
  defaultPolicyFor,
  isPolicyBounds,
  type ReservationPolicy,
} from '@yalla/api';

/**
 * Every policy field, with the one sentence that says what it does.
 *
 * This screen is the only place the product's behaviour is configurable, and
 * **every field is a number whose meaning is not obvious from its name.**
 * "Turn time" is not a concept an owner has; "how long a table is held for a
 * booking, which is why the diner is told the table is theirs until 19:45" is.
 * So the sentence is not help text hidden behind an icon — it is part of the
 * field, and it is written in terms of what a diner or a waiter experiences
 * rather than what the column stores.
 *
 * The groups are the questions an owner is actually asking, in the order they
 * ask them: how far ahead can people book, how long do we hold a table, what
 * happens when they are late, what needs a human, and what goes on the bill.
 */

export type PolicyGroup = 'booking' | 'holding' | 'lateness' | 'approval' | 'money';

export const POLICY_GROUPS: readonly PolicyGroup[] = [
  'booking',
  'holding',
  'lateness',
  'approval',
  'money',
];

export type PolicyFieldKind = 'minutes' | 'days' | 'percent' | 'people' | 'toggle';

export interface PolicyFieldSpec {
  readonly key: keyof ReservationPolicy;
  readonly group: PolicyGroup;
  readonly kind: PolicyFieldKind;
  /** Null when the field has no numeric bounds — a toggle, or a nullable count. */
  readonly bounds: { readonly min: number; readonly max: number } | null;
  /** True when clearing the field means "no limit" rather than zero. */
  readonly nullable: boolean;
}

export const POLICY_FIELDS: readonly PolicyFieldSpec[] = [
  {
    key: 'bookingWindowDays',
    group: 'booking',
    kind: 'days',
    bounds: POLICY_BOUNDS.bookingWindowDays,
    nullable: false,
  },
  {
    key: 'minLeadMinutes',
    group: 'booking',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.minLeadMinutes,
    nullable: false,
  },
  {
    key: 'cancellationDeadlineMinutes',
    group: 'booking',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.cancellationDeadlineMinutes,
    nullable: false,
  },

  {
    key: 'turnTimeMinutes',
    group: 'holding',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.turnTimeMinutes,
    nullable: false,
  },
  {
    key: 'bufferMinutes',
    group: 'holding',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.bufferMinutes,
    nullable: false,
  },
  {
    key: 'walkInHoldbackMinutes',
    group: 'holding',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.walkInHoldbackMinutes,
    nullable: false,
  },
  { key: 'maxSeatOverhang', group: 'holding', kind: 'people', bounds: null, nullable: true },

  {
    key: 'graceMinutes',
    group: 'lateness',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.graceMinutes,
    nullable: false,
  },
  {
    key: 'lateNudgeAfterMinutes',
    group: 'lateness',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.lateNudgeAfterMinutes,
    nullable: false,
  },
  {
    key: 'graceExtensionMinutes',
    group: 'lateness',
    kind: 'minutes',
    bounds: POLICY_BOUNDS.graceExtensionMinutes,
    nullable: false,
  },

  { key: 'autoConfirm', group: 'approval', kind: 'toggle', bounds: null, nullable: false },
  {
    key: 'approvalRequiredAbovePartySize',
    group: 'approval',
    kind: 'people',
    bounds: null,
    nullable: true,
  },

  {
    key: 'serviceChargePercent',
    group: 'money',
    kind: 'percent',
    bounds: POLICY_BOUNDS.serviceChargePercent,
    nullable: false,
  },
  { key: 'pricesIncludeVat', group: 'money', kind: 'toggle', bounds: null, nullable: false },
];

export function fieldsInGroup(group: PolicyGroup): readonly PolicyFieldSpec[] {
  return POLICY_FIELDS.filter((field) => field.group === group);
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * What ships, so there is a way back.
 *
 * An owner who set turn time to 45 minutes and watched their bookings collapse
 * needs to be able to undo that without knowing what it used to be, and the
 * shipped value shown beside the field is what tells them their 45 is unusual
 * in the first place.
 */
export function defaultValue(
  key: keyof ReservationPolicy,
  venueType: 'cafe' | 'restaurant',
): ReservationPolicy[keyof ReservationPolicy] {
  return defaultPolicyFor(venueType)[key];
}

export function isDefault(
  policy: ReservationPolicy,
  key: keyof ReservationPolicy,
  venueType: 'cafe' | 'restaurant',
): boolean {
  return policy[key] === defaultValue(key, venueType);
}

export function differsFromDefaults(
  policy: ReservationPolicy,
  venueType: 'cafe' | 'restaurant',
): readonly (keyof ReservationPolicy)[] {
  return POLICY_FIELDS.map((field) => field.key).filter(
    (key) => !isDefault(policy, key, venueType),
  );
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** A server refusal, resolved to the input it belongs against. */
export interface FieldRefusal {
  /** Null when the message named no field this screen knows. */
  readonly field: keyof ReservationPolicy | null;
  /** The server's own sentence, shown verbatim. */
  readonly message: string;
}

/**
 * Where a rejection should be rendered.
 *
 * The server refuses an out-of-range value rather than clamping it, and names
 * the field in prose — *"Turn time must be between 15 and 360 minutes; 5
 * minutes was given."* The gateway maps that prose back to a key, and this
 * turns it into something the form can put under one input.
 *
 * A message that named nothing recognisable yields `field: null`, and the
 * screen shows it above the form. Wrong-looking, and never lost: a refusal
 * silently swallowed because the mapping missed is a save button that does
 * nothing.
 */
export function refusalFor(error: unknown): FieldRefusal | null {
  if (!isPolicyBounds(error)) return null;
  return {
    field: (error.field as keyof ReservationPolicy | null) ?? null,
    message: error.detail,
  };
}

// ---------------------------------------------------------------------------
// Local checking
// ---------------------------------------------------------------------------

/**
 * Fields already outside their bounds, before the request.
 *
 * Marks the input as it is typed. **Never clamps and never blocks the save on
 * its own**: the server is the authority, its bounds could change, and a client
 * that refused a value the server would have accepted is a client an owner has
 * to work around. The save button stays live; the marks are a warning.
 */
export function outOfBounds(policy: ReservationPolicy): readonly (keyof ReservationPolicy)[] {
  return POLICY_FIELDS.filter((field) => {
    if (!field.bounds) return false;
    const value = policy[field.key];
    if (typeof value !== 'number') return false;
    return value < field.bounds.min || value > field.bounds.max;
  }).map((field) => field.key);
}
