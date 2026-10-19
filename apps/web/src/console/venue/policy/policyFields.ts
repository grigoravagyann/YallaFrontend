import {
  POLICY_BOUNDS,
  isPolicyBounds,
  type PolicyFieldBound,
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
  /**
   * What the server accepts, mirrored: never stricter. `max` is null for the
   * two counts the server bounds from below only. Null for a toggle.
   */
  readonly bounds: { readonly min: number; readonly max: number | null } | null;
  /** What one press of − or + moves the stepper by (Policy artboard). */
  readonly step: number;
  /** True when clearing the field means "no limit" rather than zero. */
  readonly nullable: boolean;
}

function minutes(
  key: keyof typeof POLICY_BOUNDS,
  group: PolicyGroup,
  step: number,
): PolicyFieldSpec {
  return { key, group, kind: 'minutes', bounds: POLICY_BOUNDS[key], step, nullable: false };
}

export const POLICY_FIELDS: readonly PolicyFieldSpec[] = [
  {
    key: 'bookingWindowDays',
    group: 'booking',
    kind: 'days',
    bounds: POLICY_BOUNDS.bookingWindowDays,
    step: 1,
    nullable: false,
  },
  minutes('minLeadMinutes', 'booking', 5),
  minutes('cancellationDeadlineMinutes', 'booking', 15),

  minutes('turnTimeMinutes', 'holding', 5),
  minutes('bufferMinutes', 'holding', 5),
  minutes('walkInHoldbackMinutes', 'holding', 5),
  // The server refuses a negative overhang and sets no ceiling (`ReservationPolicyLimits`).
  {
    key: 'maxSeatOverhang',
    group: 'holding',
    kind: 'people',
    bounds: { min: 0, max: null },
    step: 1,
    nullable: true,
  },

  minutes('graceMinutes', 'lateness', 5),
  minutes('lateNudgeAfterMinutes', 'lateness', 5),
  minutes('graceExtensionMinutes', 'lateness', 5),

  { key: 'autoConfirm', group: 'approval', kind: 'toggle', bounds: null, step: 0, nullable: false },
  // A party of one is the smallest threshold that means anything; no ceiling.
  {
    key: 'approvalRequiredAbovePartySize',
    group: 'approval',
    kind: 'people',
    bounds: { min: 1, max: null },
    step: 1,
    nullable: true,
  },

  {
    key: 'serviceChargePercent',
    group: 'money',
    kind: 'percent',
    bounds: POLICY_BOUNDS.serviceChargePercent,
    step: 1,
    nullable: false,
  },
  {
    key: 'pricesIncludeVat',
    group: 'money',
    kind: 'toggle',
    bounds: null,
    step: 0,
    nullable: false,
  },
];

export function fieldsInGroup(
  group: PolicyGroup,
  fields: readonly PolicyFieldSpec[] = POLICY_FIELDS,
): readonly PolicyFieldSpec[] {
  return fields.filter((field) => field.group === group);
}

/**
 * The fields with the server's own bounds where it sent them
 * (`…/reservation-policy/defaults`), so the form is never stricter than the
 * server even if the two copies drift; the mirrored ones stand in otherwise.
 */
export function withServerBounds(
  bounds: readonly PolicyFieldBound[] | undefined,
): readonly PolicyFieldSpec[] {
  if (!bounds || bounds.length === 0) return POLICY_FIELDS;
  return POLICY_FIELDS.map((field) => {
    const server = bounds.find((bound) => bound.field === field.key);
    return server && field.bounds
      ? { ...field, bounds: { min: server.min, max: server.max } }
      : field;
  });
}

/**
 * The policy as typed. A number field that has been emptied holds `null`
 * whether or not the field is nullable: for a nullable one it means "no
 * limit", for any other it is a field still to be filled in, and is marked.
 */
export type PolicyDraft = {
  readonly [K in keyof ReservationPolicy]: ReservationPolicy[K] | null;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * What ships, so there is a way back.
 *
 * An owner who set turn time to 45 minutes and watched their bookings collapse
 * needs to be able to undo that without knowing what it used to be, and the
 * shipped value shown beside the field is what tells them their 45 is unusual
 * in the first place. `defaults` is the server's own copy for this branch.
 */
export function isDefault(
  policy: PolicyDraft,
  key: keyof ReservationPolicy,
  defaults: ReservationPolicy,
): boolean {
  return policy[key] === defaults[key];
}

export function differsFromDefaults(
  policy: PolicyDraft,
  defaults: ReservationPolicy,
): readonly (keyof ReservationPolicy)[] {
  return POLICY_FIELDS.map((field) => field.key).filter((key) => !isDefault(policy, key, defaults));
}

/** The fields whose value differs between two drafts: the unsaved changes. */
export function changedFields(
  draft: PolicyDraft,
  saved: PolicyDraft,
): readonly (keyof ReservationPolicy)[] {
  return POLICY_FIELDS.map((field) => field.key).filter((key) => draft[key] !== saved[key]);
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** A server refusal, resolved to the input it belongs against. */
export interface FieldRefusal {
  /** Null when the message named no field this screen knows. */
  readonly field: keyof ReservationPolicy | null;
  /** The server's own sentence: for a developer, never shown to an owner as is. */
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
 * screen says the save failed. Never lost: a refusal silently swallowed
 * because the mapping missed is a save button that does nothing.
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
 * Fields the server would refuse, before the request: outside their bounds,
 * or emptied where empty means nothing.
 *
 * Marks the input as it is typed, and the save asks for them to be fixed
 * first (Policy artboard). **Never clamps**, and never stricter than the
 * server: the bounds are the server's own (`POLICY_BOUNDS`).
 */
export function outOfBounds(
  policy: PolicyDraft,
  fields: readonly PolicyFieldSpec[] = POLICY_FIELDS,
): readonly (keyof ReservationPolicy)[] {
  return fields.filter((field) => fieldOutOfBounds(policy, field)).map((field) => field.key);
}

function fieldOutOfBounds(policy: PolicyDraft, field: PolicyFieldSpec): boolean {
  if (!field.bounds) return false;
  const value = policy[field.key];
  if (value === null) return !field.nullable;
  if (typeof value !== 'number' || !Number.isFinite(value)) return true;
  return value < field.bounds.min || (field.bounds.max !== null && value > field.bounds.max);
}

/** One press of − or +: a step towards the bound, never past it. */
export function stepped(
  field: PolicyFieldSpec,
  value: number | null,
  direction: -1 | 1,
): number | null {
  const bounds = field.bounds ?? { min: 0, max: null };
  // "No limit" has nowhere lower to go, and one up from it is the smallest limit.
  if (value === null) return direction === 1 ? bounds.min : null;
  const next = value + direction * field.step;
  if (next < bounds.min) return bounds.min;
  if (bounds.max !== null && next > bounds.max) return bounds.max;
  return next;
}

// ---------------------------------------------------------------------------
// What a diner sees
// ---------------------------------------------------------------------------

/** The example booking every group's sentence is told around: 19:00. */
export const EXAMPLE_START = 19 * 60;

/** Minutes from midnight as a wall clock, past midnight wrapping round: 1170 → "19:30". */
export function clock(minutesFromMidnight: number): string {
  const day = 24 * 60;
  const wrapped = ((Math.round(minutesFromMidnight) % day) + day) % day;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export type LeadExample =
  | { readonly kind: 'zero' }
  | { readonly kind: 'sameDay' }
  | { readonly kind: 'until'; readonly time: string };

/**
 * The shortest-notice sentence's case: zero is "right up to the time", a
 * notice as long as the day before 19:00 or longer is "not the same day", and
 * anything else names the last moment a 19:00 table can be booked.
 */
export function leadExample(minLeadMinutes: number | null): LeadExample {
  const lead = minLeadMinutes ?? 0;
  if (lead <= 0) return { kind: 'zero' };
  if (lead >= EXAMPLE_START) return { kind: 'sameDay' };
  return { kind: 'until', time: clock(EXAMPLE_START - lead) };
}
