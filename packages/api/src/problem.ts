import type { components } from './generated/schema';

/**
 * The backend's one error shape.
 *
 * Every failure is an RFC 7807 problem document with four extension members,
 * and `code` is the one to branch on — never the message, which is prose for a
 * developer. The type comes straight from the generated schema so a renamed
 * member on the server is a compile error here rather than an `undefined` in a
 * screen.
 */
export type ProblemDetails = components['schemas']['Yalla.Api.Errors.UnifiedErrorEnvelope'];

/**
 * Read a problem document out of a response body, or nothing.
 *
 * Tolerant on purpose: a proxy or a crashed process can answer with HTML or an
 * empty body, and a client that throws while parsing the error loses the real
 * status code in the process.
 */
export function parseProblem(body: unknown): ProblemDetails | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const candidate = body as Partial<Record<keyof ProblemDetails, unknown>>;
  if (typeof candidate.code !== 'string' || typeof candidate.status !== 'number') return undefined;

  return {
    code: candidate.code,
    status: candidate.status,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    detail: typeof candidate.detail === 'string' ? candidate.detail : '',
    type: typeof candidate.type === 'string' ? candidate.type : '',
    traceId: typeof candidate.traceId === 'string' ? candidate.traceId : '',
    instance: typeof candidate.instance === 'string' ? candidate.instance : null,
    context:
      typeof candidate.context === 'object' && candidate.context !== null
        ? (candidate.context as Record<string, unknown>)
        : null,
    errors:
      typeof candidate.errors === 'object' && candidate.errors !== null
        ? (candidate.errors as Record<string, string[]>)
        : null,
  };
}
