import { ApiError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { isSmsUnavailable } from './phoneProof';

/**
 * The SMS door's refusal, recognised before and after YallaFrontend#62: its
 * `SmsUnavailableError`, and the raw 503 `sms-unavailable` a gateway without
 * #62 hands over from a backend that has Yalla#52 (review S4).
 */
describe('isSmsUnavailable', () => {
  const problem = (code: string) => ({ code, status: 503, title: 'x' }) as never;

  it("takes #62's error by its name", () => {
    class SmsUnavailableError extends Error {
      override name = 'SmsUnavailableError';
    }
    expect(isSmsUnavailable(new SmsUnavailableError())).toBe(true);
  });

  it('takes the raw 503 sms-unavailable from a gateway without #62', () => {
    expect(
      isSmsUnavailable(
        new ApiError('Service Unavailable', {
          status: 503,
          url: '/api/auth/diner/request-code',
          problem: problem('sms-unavailable'),
        }),
      ),
    ).toBe(true);
  });

  it('leaves every other failure alone', () => {
    expect(
      isSmsUnavailable(
        new ApiError('Service Unavailable', { status: 503, url: '/x', problem: problem('down') }),
      ),
    ).toBe(false);
    expect(isSmsUnavailable(new Error('network'))).toBe(false);
  });
});
