import { StaffPermissionError, StaffPinTakenError, ValidationError } from '@yalla/api';

/**
 * A staff write the server refused for a reason the form can show.
 *
 * Three shapes, one treatment: the rank rule (403, `StaffPermissionError`), a
 * PIN somebody on the same tablet already uses (409 `pin-taken`,
 * `StaffPinTakenError`), and a field the server named — the branch a role is
 * bound to arrives as a 422 `validation-failed` on `branchId`. Each carries a
 * `field` when the server named one and the server's own sentence, which is
 * what goes under that field.
 */
export type StaffRefusal = StaffPermissionError | StaffPinTakenError | ValidationError;

/** The refusal in `error`, when it is one a staff form shows; `null` otherwise. */
export function asStaffRefusal(error: unknown): StaffRefusal | null {
  if (error instanceof StaffPermissionError || error instanceof StaffPinTakenError) return error;
  // A validation refusal is the form's only when it names what to fix.
  if (error instanceof ValidationError && error.field) return error;
  return null;
}

/**
 * The sentence for `field`, when the refusal is about it.
 *
 * A 422 can name several fields; each gets its own message rather than the
 * joined `detail`.
 */
export function refusalText(refusal: StaffRefusal | null, field: string): string | null {
  if (!refusal) return null;
  if (refusal instanceof ValidationError) {
    const own = refusal.violations.find((violation) => violation.field === field);
    if (own) return own.message || refusal.message;
    return refusal.field === field ? refusal.message : null;
  }
  return refusal.field === field ? refusal.message : null;
}

/**
 * Whether the refusal belongs at the foot of the form: it named no field, or
 * one this form does not render (the edit dialog has no PIN field).
 */
export function refusalIsFormLevel(
  refusal: StaffRefusal | null,
  rendered: readonly string[],
): boolean {
  if (!refusal) return false;
  return !refusal.field || !rendered.includes(refusal.field);
}
