import { describe, expect, it } from 'vitest';
import { StaffPinTakenError } from '../contracts/errors';
import type { CreateStaffInput } from '../contracts/staff';
import { createConsoleMockGateway } from './consoleMock';

/**
 * PINs unique per tablet roster, as `PinTakenException` has it: "the same
 * tablet" is, for somebody at a branch, everyone active at that branch and
 * everyone venue-wide; for somebody venue-wide, every active person in the
 * venue. Deactivated people do not count. Checked when a PIN is set — on
 * create and on a new PIN — and a move does not re-check it.
 *
 * The mock compares plain values, and only the PINs it was given: the
 * fixture's people have none it knows, as the development seed's have
 * "dev-no-pin-set".
 */

const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

let n = 0;
const hire = (over: Partial<CreateStaffInput>): CreateStaffInput => ({
  fullName: `Person ${(n += 1)}`,
  phone: `+3747755${String(n).padStart(4, '0')}`,
  role: 'waiter',
  pin: '0000',
  branchId: 'b-lumen-north',
  ...over,
});

function expectTaken(error: unknown) {
  expect(error).toBeInstanceOf(StaffPinTakenError);
  const refusal = error as StaffPinTakenError;
  expect(refusal.status).toBe(409);
  expect(refusal.code).toBe('pin-taken');
  expect(refusal.field).toBe('pin');
  expect(refusal.message).toBe(PIN_TAKEN);
}

describe('console mock — a PIN somebody on the same tablet uses', () => {
  it('is refused at the same branch, on create and on a new PIN, and nothing is written', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    await owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '4321' }) });

    expectTaken(
      await failing(
        owner.createStaff({
          venueId: 'v-lumen',
          staff: hire({ fullName: 'Second', pin: '4321' }),
        }),
      ),
    );
    expect((await owner.listStaff('v-lumen')).some((m) => m.fullName === 'Second')).toBe(false);

    expectTaken(
      await failing(
        owner.setStaffPin({
          venueId: 'v-lumen',
          staffMemberId: 'b-lumen-north-kitchen',
          pin: '4321',
        }),
      ),
    );
  });

  it("is another tablet's business at a sibling branch, and nobody's for a leaver", async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    await owner.createStaff({
      venueId: 'v-lumen',
      staff: hire({ branchId: 'b-lumen-cascade', pin: '2468' }),
    });
    await expect(
      owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '2468' }) }),
    ).resolves.toBeTruthy();

    const leaver = await owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '9999' }) });
    await owner.updateStaff({
      venueId: 'v-lumen',
      staffMemberId: leaver.id,
      patch: { isActive: false },
    });
    await expect(
      owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '9999' }) }),
    ).resolves.toBeTruthy();
  });

  it('counts venue-wide people on every tablet, and checks theirs against the whole venue', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    await owner.createStaff({
      venueId: 'v-lumen',
      staff: hire({ role: 'kitchen', branchId: null, pin: '1357' }),
    });
    // A venue-wide cook is on this branch's tablet too.
    expectTaken(
      await failing(owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '1357' }) })),
    );

    // Somebody venue-wide is on every tablet: a sibling branch's PIN clashes.
    await owner.createStaff({
      venueId: 'v-lumen',
      staff: hire({ branchId: 'b-lumen-saryan', pin: '8642' }),
    });
    expectTaken(
      await failing(
        owner.createStaff({
          venueId: 'v-lumen',
          staff: hire({ role: 'generalManager', branchId: null, pin: '8642' }),
        }),
      ),
    );

    // Another venue's PIN is no concern of this one.
    await expect(
      owner.createStaff({
        venueId: 'v-tumanyan',
        staff: hire({ branchId: 'b-tumanyan-main', pin: '1357' }),
      }),
    ).resolves.toBeTruthy();
  });

  it('lets somebody set the PIN they already have, and does not re-check a move', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    const first = await owner.createStaff({ venueId: 'v-lumen', staff: hire({ pin: '5307' }) });
    await expect(
      owner.setStaffPin({ venueId: 'v-lumen', staffMemberId: first.id, pin: '5307' }),
    ).resolves.toBeTruthy();

    // The same PIN at a sibling branch, then moved here: left alone, as the
    // server leaves duplicates a move creates.
    const other = await owner.createStaff({
      venueId: 'v-lumen',
      staff: hire({ branchId: 'b-lumen-cascade', pin: '5307' }),
    });
    await expect(
      owner.updateStaff({
        venueId: 'v-lumen',
        staffMemberId: other.id,
        patch: { setBranch: true, branchId: 'b-lumen-north' },
      }),
    ).resolves.toMatchObject({ branchId: 'b-lumen-north' });
  });
});
