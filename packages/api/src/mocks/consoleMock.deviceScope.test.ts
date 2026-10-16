import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The tablet routes under `/api/branches/{branchId}` — enrolment codes,
 * revoking, unlocking a PIN — are `ManagerOrAbove` and `BranchScoped` on the
 * server, like every other branch route: a branch manager is refused at a
 * sibling branch, a general manager is let in everywhere in the venue. And a
 * lockout is cleared only for somebody this branch's tablets would lock out:
 * at this branch, or venue-wide (`ClearPinLockoutAsync`), else 404.
 */

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

describe('console mock — the tablet routes are branch-scoped', () => {
  it('refuses a branch manager at a sibling branch and lets a general manager in', async () => {
    const bm = createConsoleMockGateway({ role: 'manager' });
    expect(await failing(bm.createEnrolmentCode('b-lumen-cascade'))).toBeInstanceOf(ForbiddenError);
    const [device] = await createConsoleMockGateway({ role: 'owner' }).listDevices(
      'b-lumen-cascade',
    );
    expect(
      await failing(bm.revokeDevice({ branchId: 'b-lumen-cascade', deviceId: device!.id })),
    ).toBeInstanceOf(ForbiddenError);
    expect(
      await failing(
        bm.clearPinLockout({
          branchId: 'b-lumen-cascade',
          staffMemberId: 'b-lumen-cascade-waiter-1',
        }),
      ),
    ).toBeInstanceOf(ForbiddenError);

    const gm = createConsoleMockGateway({ role: 'generalManager' });
    await expect(gm.createEnrolmentCode('b-lumen-cascade')).resolves.toMatchObject({
      branchId: 'b-lumen-cascade',
    });
    await expect(
      gm.clearPinLockout({
        branchId: 'b-lumen-cascade',
        staffMemberId: 'b-lumen-cascade-waiter-1',
      }),
    ).resolves.toBeUndefined();
  });

  it("clears only a lockout this branch's tablets would have", async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    // Another branch's waiter: their own manager clears it there.
    expect(
      await failing(
        owner.clearPinLockout({
          branchId: 'b-lumen-north',
          staffMemberId: 'b-lumen-cascade-waiter-1',
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
    // Somebody venue-wide is on this branch's tablets.
    await expect(
      owner.clearPinLockout({
        branchId: 'b-lumen-north',
        staffMemberId: 'v-lumen-general-manager',
      }),
    ).resolves.toBeUndefined();
  });
});
