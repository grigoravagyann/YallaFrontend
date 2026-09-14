import { ValidationError } from '../errors';

/** One violation, spelled the way `ApiExceptionMapper` writes `context.fields[]`. */
export interface MockViolation {
  readonly field: string;
  readonly message: string;
  /** `FieldBounds` as the wire spells it: `required`, `range`, `min`, `max`, `conflict`. */
  readonly bound?: string;
  readonly min?: number;
  readonly max?: number;
}

/**
 * A 422 `validation-failed` naming every field, as the server raises one.
 *
 * One builder for every mock, so a violation carries its `bound` everywhere —
 * the console maps field *and* bound to its own sentence, and a mock that
 * named the field without the bound would let that mapping pass untested.
 */
export function validationFailed(url: string, fields: readonly MockViolation[]): ValidationError {
  return new ValidationError({
    url,
    status: 422,
    problem: {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      detail: fields.map((violation) => violation.message).join(' '),
      code: 'validation-failed',
      traceId: 'mock',
      context: { field: fields[0]?.field ?? null, fields },
    },
  });
}

/** A 400 `invalid-request` naming one parameter, as a domain guard raises it. */
export function invalidRequest(url: string, field: string, detail: string): ValidationError {
  return new ValidationError({
    url,
    status: 400,
    problem: {
      type: 'about:blank',
      title: 'Invalid request',
      status: 400,
      detail,
      code: 'invalid-request',
      traceId: 'mock',
      context: { field },
    },
  });
}
