import { ApiError, SmsUnavailableError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { isSmsUnavailable } from './phoneProof';

/** The SMS door's refusal: the gateway's `SmsUnavailableError`, and nothing else. */
describe('isSmsUnavailable', () => {
  const problem = (code: string) => ({ code, status: 503, title: 'x' }) as never;

  it("takes the gateway's SmsUnavailableError", () => {
    expect(isSmsUnavailable(new SmsUnavailableError({ url: '/api/auth/diner/request-code' }))).toBe(
      true,
    );
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
