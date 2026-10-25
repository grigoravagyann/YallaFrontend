import { NotFoundError } from '../../errors';
import { canSetStaffPin } from '../../contracts/staff';
import { KitchenPhoneNotAllowedError } from '../../contracts/errors';
import {
  ENROLMENT_CODE_LENGTH,
  ENROLMENT_CODE_ALPHABET,
  PHONE_PAIRING_MINUTES,
  formatPairingCode,
  PHONE_PAIRING_PATH,
} from '../../contracts/staffAuth';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** A branch's tablets and paired phones. */
export function devicesMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  'listDevices' | 'createPhonePairing' | 'createEnrolmentCode' | 'revokeDevice'
> {
  const {
    SERVER_ROLE,
    actingStaff,
    devicesFor,
    now,
    pairedPhonesFor,
    registry,
    requireBranchInVenue,
    requireManagerAtBranch,
    staffFor,
    staffPermission,
    venueOfBranch,
    wait,
  } = ctx;
  return {
    // --- Devices --------------------------------------------------------------

    async listDevices(branchId, kind) {
      await wait();
      requireBranchInVenue(branchId);
      const all = [...devicesFor(branchId), ...pairedPhonesFor(branchId)];
      return kind ? all.filter((device) => (device.kind ?? 'tablet') === kind) : all;
    },

    async createPhonePairing({ branchId, staffMemberId }) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/staff/${staffMemberId}/phone-pairings`;
      requireManagerAtBranch(branchId, url);
      const venueId = venueOfBranch(branchId);
      const person = venueId
        ? staffFor(venueId).find((member) => member.id === staffMemberId)
        : undefined;
      // Somebody who does not sign in at this branch, or no longer works, is not
      // there as far as this route is concerned.
      if (
        !venueId ||
        !person ||
        !person.isActive ||
        (person.branchId !== null && person.branchId !== branchId)
      ) {
        throw new NotFoundError({ url });
      }
      // The staff-admin rule: somebody the caller may manage, or the caller.
      const actor = actingStaff(venueId);
      if (actor.role !== 'platformAdmin' && !canSetStaffPin(actor, person)) {
        throw staffPermission(
          `Pairing a phone for a ${SERVER_ROLE[person.role]}`,
          person.role === 'manager' ? 'generalManager' : 'owner',
        );
      }
      if (person.role === 'kitchen') throw new KitchenPhoneNotAllowedError({ url });

      const at = now();
      // A newer code takes a lost one back.
      for (const earlier of registry.phonePairings.values()) {
        if (
          earlier.staffMemberId === staffMemberId &&
          earlier.redeemedAtUtc === null &&
          earlier.supersededAtUtc === null
        ) {
          registry.phonePairings.set(earlier.code, {
            ...earlier,
            supersededAtUtc: at.toISOString(),
          });
        }
      }
      const code = Array.from({ length: ENROLMENT_CODE_LENGTH }, () => {
        ctx.sequence = (ctx.sequence * 1103515245 + 12345) % 2147483648;
        return ENROLMENT_CODE_ALPHABET[ctx.sequence % ENROLMENT_CODE_ALPHABET.length];
      }).join('');
      const expiresAtUtc = new Date(at.getTime() + PHONE_PAIRING_MINUTES * 60_000).toISOString();
      registry.phonePairings.set(code, {
        code,
        branchId,
        staffMemberId,
        expiresAtUtc,
        redeemedAtUtc: null,
        supersededAtUtc: null,
      });
      const shown = formatPairingCode(code);
      const origin =
        (globalThis as { location?: { origin?: string } }).location?.origin ??
        'http://localhost:5173';
      return {
        code: shown,
        expiresAtUtc,
        pairingUrl: `${origin}${PHONE_PAIRING_PATH}#code=${shown}`,
        staffMemberId,
        branchId,
      };
    },

    async createEnrolmentCode(branchId) {
      await wait();
      // `ManagerOrAbove` and `BranchScoped`, as every tablet route.
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/devices`);
      /*
       * A fresh code every time, and the old one is not retrievable — the same
       * promise the server makes, which is why "regenerate" is a new code
       * rather than a second look at the last one.
       *
       * **Ten characters of the server's own readable alphabet.** No I, L, O or
       * U and no digits that resemble them: a manager reading this across a bar
       * should not have to say "letter O, not zero". The mock used to emit six
       * digits, which looked plausible, sized differently on screen, and would
       * have let a client built against it meet a real code it had never been
       * laid out for.
       */
      const alphabet = ENROLMENT_CODE_ALPHABET;
      const code = Array.from({ length: ENROLMENT_CODE_LENGTH }, () => {
        ctx.sequence = (ctx.sequence * 1103515245 + 12345) % 2147483648;
        return alphabet[ctx.sequence % alphabet.length];
      }).join('');
      const expiresAtUtc = new Date(now().getTime() + 24 * 60 * 60_000).toISOString();
      // Left for the mock tablet to redeem (QA F13): the code crosses a
      // counter and usually a reload before it is typed in.
      registry.enrolmentCodes.set(code, { code, branchId, expiresAtUtc, spentAtUtc: null });
      return { code, expiresAtUtc, branchId };
    },

    async revokeDevice({ branchId, deviceId }) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/devices`);
      // A phone the mock staff app paired lives in the registry: unpairing it
      // there is what stops its next request, as revoking does on the server.
      const paired = registry.devices
        .values()
        .find(
          (device) =>
            device.kind === 'phone' && device.branchId === branchId && device.deviceId === deviceId,
        );
      if (paired) {
        if (paired.revokedAtUtc === null) {
          registry.devices.set(paired.deviceToken, {
            ...paired,
            revokedAtUtc: now().toISOString(),
          });
        }
        return;
      }
      const list = devicesFor(branchId);
      const index = list.findIndex((device) => device.id === deviceId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });
      // Revoked, not removed: the list is an audit trail, and "which tablet was
      // this done from, and was it still ours" is asked after the fact.
      list[index] = { ...list[index]!, isRevoked: true, revokedAtUtc: now().toISOString() };
    },
  };
}
