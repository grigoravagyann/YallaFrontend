import { UnsupportedImageError } from '../contracts/errors';
import { ApiError, ForbiddenError, UnauthorizedError } from '../errors';
import { parseProblem } from '../problem';

/**
 * A refused photo upload, as the error a screen can say something useful about.
 *
 * Shared by every upload route — a branch's menu photo and a diner's avatar go
 * through the same sniffing and the same size cap on the server, and answer
 * with the same `unsupported-image` 409 — so the reading of that answer lives
 * once. The reason is taken from the status and the server's own sentence,
 * because the three fixes differ: export the HEIC as a JPEG, pick a smaller
 * file, pick a bigger picture.
 */
export function photoRejection(url: string, status: number, body: unknown): ApiError {
  const problem = parseProblem(body);
  const detail = problem?.detail ?? 'That photo could not be uploaded.';
  const lower = detail.toLowerCase();

  if (status === 413 || lower.includes('larger') || lower.includes('too big')) {
    return new UnsupportedImageError({ url, reason: 'tooLarge', detail });
  }
  if (status === 409 || status === 415) {
    const detected = problem?.context?.['detectedFormat'];
    return new UnsupportedImageError({
      url,
      reason: lower.includes('pixel') || lower.includes('dimension') ? 'dimensions' : 'format',
      detectedFormat: typeof detected === 'string' ? detected : null,
      detail,
    });
  }
  if (status === 401) return new UnauthorizedError({ url, body, problem });
  if (status === 403) return new ForbiddenError({ url, body, problem });
  return new ApiError(detail, { status, url, body, problem });
}

/**
 * The same reading, for an upload that went through `ApiClient` and already
 * arrived as a typed error. Anything that is not an upload refusal is returned
 * untouched, so the client's own 401/404 mapping stands.
 */
export function photoRejectionFrom(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  if (error.status === 409 || error.status === 413 || error.status === 415) {
    return photoRejection(error.url, error.status, error.body);
  }
  return error;
}
