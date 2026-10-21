import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../client';
import { EnrolmentCodeExpiredError, EnrolmentCodeSpentError } from '../contracts/errors';
import { ApiError, UnauthorizedError } from '../errors';
import type { ProblemDetails } from '../problem';
import { normalizeEnrolmentCode } from '../contracts/staffAuth';
import { createStaffAuth } from './staffEndpoints';

const URL = '/api/auth/staff/enrol';

function refusedWith(error: Error) {
  const post = vi.fn().mockRejectedValue(error);
  return createStaffAuth({ post } as unknown as ApiClient);
}

const problem = (code: string) =>
  ({ code, status: 401, title: '', detail: '', type: '' }) as ProblemDetails;

const command = { code: 'H7KQ2MXP9D', deviceId: 'dev-1', deviceName: 'Սրահ 1' };

describe('POST /api/auth/staff/enrol refusals', () => {
  it('reads a 401 with the expired reason as an expired code', async () => {
    const auth = refusedWith(
      new UnauthorizedError({ url: URL, problem: problem('enrolment-code-expired') }),
    );
    await expect(auth.enrol(command)).rejects.toBeInstanceOf(EnrolmentCodeExpiredError);
  });

  it('leaves a mistyped code as a plain 401', async () => {
    const auth = refusedWith(
      new UnauthorizedError({ url: URL, problem: problem('enrolment-code-invalid') }),
    );
    const error = await auth.enrol(command).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).not.toBeInstanceOf(EnrolmentCodeExpiredError);
  });

  it('reads a 409 as a spent code', async () => {
    const auth = refusedWith(new ApiError('Conflict', { status: 409, url: URL }));
    await expect(auth.enrol(command)).rejects.toBeInstanceOf(EnrolmentCodeSpentError);
  });
});

describe('normalizeEnrolmentCode', () => {
  it('sends the code as the server hashed it, whatever the keyboard did', () => {
    expect(normalizeEnrolmentCode('h7kq2-mxp9d')).toBe('H7KQ2MXP9D');
    expect(normalizeEnrolmentCode(' H7KQ2 MXP9D\n')).toBe('H7KQ2MXP9D');
  });

  it('drops characters no code contains and stops at ten', () => {
    expect(normalizeEnrolmentCode('O0I1LU')).toBe('');
    expect(normalizeEnrolmentCode('H7KQ2MXP9DZZ')).toBe('H7KQ2MXP9D');
  });
});
