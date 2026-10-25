import {
  assignableRoles,
  isAdminRole,
  type StaffMember,
  outranks,
  type StaffSignInLink,
} from '../../contracts/staff';
import { StaffPermissionError } from '../../contracts/errors';
import { ValidationError, NotFoundError } from '../../errors';
import { mockTokenHash } from '../mockRegistry';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** The venue's staff: people, PINs and sign-in issuance. */
export function staffMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'listStaff'
  | 'createStaff'
  | 'updateStaff'
  | 'setStaffPin'
  | 'issueStaffSignIn'
  | 'clearPinLockout'
> {
  const {
    ADDRESS_TAKEN,
    EMAIL_MAX_LENGTH,
    SERVER_ROLE,
    actingStaff,
    addressTaken,
    badAddress,
    conflict,
    nextId,
    now,
    pinOnly,
    pins,
    reachesWholeVenue,
    registry,
    requireBranchSuitsRole,
    requireManagerAtBranch,
    requirePinFree,
    requireReach,
    requireVenueInScope,
    staffFor,
    venueOfBranch,
    wait,
  } = ctx;
  return {
    // --- Staff ----------------------------------------------------------------

    async listStaff(venueId) {
      await wait();
      requireVenueInScope(venueId);
      const actor = actingStaff(venueId);
      // `ListAsync`: a branch manager sees their own branch's people — the
      // same reach they have to change them. Everyone venue-wide sees the venue.
      return reachesWholeVenue(actor)
        ? [...staffFor(venueId)]
        : staffFor(venueId).filter((member) => member.branchId === actor.branchId);
    },

    async createStaff({ venueId, staff }) {
      await wait();
      /*
       * The role guard, enforced here as the server enforces it.
       *
       * The mock has to refuse what the server refuses or the screen's pickers
       * could be wrong and every test would still pass — which is precisely
       * how the availability bug survived. `assignableRoles` is the same
       * function the picker is built from, so the two cannot disagree about
       * what a manager may create.
       */
      const actor = actingStaff(venueId);
      if (!assignableRoles(actor.role).includes(staff.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `A ${actor.role} cannot create a ${staff.role}.`,
          field: 'role',
        });
      }

      // `RequireReach`: a branch manager adds people to their own branch. A
      // branchless waiter would be on every tablet in the venue, which is
      // further than the manager who made them reaches.
      requireReach(
        actor,
        staff.branchId,
        `Creating a ${SERVER_ROLE[staff.role]} at another branch`,
      );

      // The new row's invariants: the branch must suit the role.
      requireBranchSuitsRole(URL_TAG, staff.role, staff.branchId);

      // One PIN per person on a tablet's keypad.
      requirePinFree(venueId, { id: null, branchId: staff.branchId }, staff.pin);

      /*
       * Either both or neither, as the server rules it: an email without a
       * password is a 400 with no field named, and so is a password without
       * an email — `HasPasswordCredentials` is `Email is not null &&
       * PasswordHash is not null`, so a person holding one and not the other
       * is a state the server can never report. An empty string counts as
       * given: it `is not null` there, and is refused as blank.
       *
       * This mock used to accept the email half and mark the person
       * sign-in-less, which would have let a screen forward the address on
       * the create call and pass every test while the real backend refused
       * every hire. A manager gets their sign-in through `issueStaffSignIn`,
       * after they exist.
       */
      const email = staff.email ?? null;
      const password = staff.password ?? null;
      if ((email === null) !== (password === null) || email?.trim() === '' || password === '') {
        throw new ValidationError({
          url: URL_TAG,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid request',
            status: 400,
            detail: 'An admin-panel sign-in needs both an email address and a password.',
            code: 'invalid-request',
            traceId: 'mock',
          },
        });
      }

      // Only the two roles that use the admin panel may hold a password: the
      // server's `RequireCanHoldPassword`, a 409 about the person being made.
      if (email !== null && !isAdminRole(staff.role)) throw conflict(pinOnly(staff.role));

      // Stored as the server stores it, and one account per address across
      // the whole table — see `addressTaken`.
      const address = email === null ? null : email.trim().toLowerCase();
      if (address !== null && addressTaken(address, null)) throw conflict(ADDRESS_TAKEN);

      const created: StaffMember = {
        id: nextId('staff'),
        venueId,
        branchId: staff.branchId,
        fullName: staff.fullName,
        phone: staff.phone,
        role: staff.role,
        isActive: true,
        email: address,
        hasPasswordSignIn: address !== null,
        isPinLocked: false,
      };

      // The PIN is kept only for the `pin-taken` check. Nothing in this mock
      // hands it back, which is the same promise the server makes and the
      // reason the screen shows it once and never again.
      staffFor(venueId).push(created);
      pins.set(created.id, staff.pin);
      return created;
    },

    async updateStaff({ venueId, staffMemberId, patch }) {
      await wait();
      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      const subject = list[index]!;
      const actor = actingStaff(venueId);

      // The rank half of `canEditStaff`; the branch half is the reach check
      // below, which the server raises with its own sentence.
      if (actor.id === subject.id || !assignableRoles(actor.role).includes(subject.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail:
            actor.id === subject.id
              ? 'You cannot change your own role or deactivate your own account.'
              : `A ${actor.role} cannot edit a ${subject.role}.`,
          field: actor.id === subject.id ? 'role' : 'role',
        });
      }

      // Reach on the person as they stand: a branch manager edits their own
      // branch's people only.
      if (actor.id !== subject.id) {
        requireReach(
          actor,
          subject.branchId,
          `Editing a ${SERVER_ROLE[subject.role]} at another branch`,
        );
      }

      if (patch.role !== undefined && !assignableRoles(actor.role).includes(patch.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `A ${actor.role} cannot assign the role ${patch.role}.`,
          field: 'role',
        });
      }

      // And on where they are going: nobody is moved somewhere the actor
      // does not reach.
      if (patch.setBranch && actor.id !== subject.id) {
        requireReach(
          actor,
          patch.branchId ?? null,
          `Moving a ${SERVER_ROLE[subject.role]} to another branch`,
        );
      }

      // The role and the branch as one pair (`StaffMember.Reassign`):
      // promoting a branch manager to general manager clears the branch in the
      // same request, and checking either half alone would refuse it.
      const nextRole = patch.role ?? subject.role;
      const nextBranch = patch.setBranch ? (patch.branchId ?? null) : subject.branchId;
      if (nextRole !== subject.role || nextBranch !== subject.branchId) {
        requireBranchSuitsRole(URL_TAG, nextRole, nextBranch);
      }

      const updated: StaffMember = {
        ...subject,
        ...(patch.fullName === undefined ? {} : { fullName: patch.fullName }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.role === undefined ? {} : { role: patch.role }),
        ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
        // Applied only behind the flag, so "venue-wide" (null) is reachable and
        // distinguishable from "leave it alone".
        ...(patch.setBranch ? { branchId: patch.branchId ?? null } : {}),
      };

      list[index] = updated;
      return updated;
    },

    async setStaffPin({ venueId, staffMemberId, pin }) {
      await wait();
      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      if (!/^\d{4,8}$/u.test(pin)) {
        throw new ValidationError({
          url: URL_TAG,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid PIN',
            status: 400,
            detail: 'A PIN is 4 to 8 digits.',
            code: 'validation-failed',
            traceId: 'mock',
            errors: { pin: ['A PIN is 4 to 8 digits.'] },
          },
        });
      }

      // SetPinAsync's one refusal: somebody else the actor may not manage.
      // Your own PIN is always yours, though your own role is not.
      const subject = list[index]!;
      const actor = actingStaff(venueId);
      if (!assignableRoles(actor.role).includes(subject.role) && actor.id !== subject.id) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `A ${actor.role} cannot set a ${subject.role}'s PIN.`,
        });
      }
      if (actor.id !== subject.id) {
        requireReach(
          actor,
          subject.branchId,
          `Resetting a ${SERVER_ROLE[subject.role]}'s PIN at another branch`,
        );
      }

      // Your own PIN again clashes with nobody; anyone else's on your tablet does.
      requirePinFree(venueId, subject, pin);

      // Setting a PIN clears any lockout, as the server's does. The PIN is kept
      // for the clash check alone; no read returns it.
      const updated = { ...list[index]!, isPinLocked: false };
      list[index] = updated;
      pins.set(subject.id, pin);
      return updated;
    },

    async issueStaffSignIn({ venueId, staffMemberId, email }) {
      await wait();

      /*
       * The server's refusals, in the server's order, because the screen shows
       * the sentence it gets and a mock that refused in a different order would
       * let the wrong sentence pass every test.
       *
       * The address goes first. `IssueSignInRequest` is validated by the
       * endpoint filter before the handler runs, so a malformed or overlong
       * address is a 422 naming `email` whatever the target is — unknown, a
       * waiter, deactivated — and the backend's own test pins that. Then the
       * handler: self and rank are the role guard (403); a PIN-only role, a
       * deactivated person and a taken address are facts about the target
       * (409).
       *
       * Lowercased with `toLowerCase`, not the host locale: the server uses
       * `ToLowerInvariant`, and in a Turkish-locale browser the two disagree
       * about `I`.
       */
      const address = email.trim().toLowerCase();
      if (address.length > EMAIL_MAX_LENGTH) {
        throw badAddress(
          `The field email must be a string with a maximum length of ${EMAIL_MAX_LENGTH}.`,
        );
      }
      if (!/^[^\s@]+@[^\s@]+$/u.test(address)) {
        throw badAddress('The email field is not a valid e-mail address.');
      }

      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      const subject = list[index]!;
      const actor = actingStaff(venueId);

      if (actor.id === subject.id) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `Issuing your own sign-in requires the PlatformAdmin role; the caller is a ${SERVER_ROLE[actor.role]}.`,
        });
      }

      if (!isAdminRole(subject.role)) throw conflict(pinOnly(subject.role));

      // Strictly above — the server's `Outranks`, not its `MayManage`: an
      // owner may edit a co-owner but cannot issue their sign-in, and a
      // manager reaches no admin role at all. `outranks` is what the screens'
      // sign-in buttons are gated on, so the two cannot disagree.
      if (!outranks(actor.role, subject.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `Issuing a sign-in for a ${SERVER_ROLE[subject.role]} requires the PlatformAdmin role; the caller is a ${SERVER_ROLE[actor.role]}.`,
        });
      }

      requireReach(
        actor,
        subject.branchId,
        `Issuing a sign-in for a ${SERVER_ROLE[subject.role]} at another branch`,
      );

      if (!subject.isActive) {
        throw conflict(
          `${subject.fullName} is deactivated. Reactivate them first, then send a sign-in link.`,
        );
      }

      if (addressTaken(address, subject.id)) throw conflict(ADDRESS_TAKEN);

      // The address changes now; the password, if any, only when the link is
      // used. `hasPasswordSignIn` is therefore left exactly as it was, which
      // is what makes "Awaiting password" true for a first issue and absent
      // for a re-issue to somebody who already signs in.
      list[index] = { ...subject, email: address };

      /*
       * An opaque token from the same generator the enrolment code uses, and
       * only the *link* is handed back: this gateway keeps nothing, so it
       * could not return it a second time if asked — the same promise the
       * server makes with its hash. The registry keeps that hash for the mock
       * venue auth, which is the server's table in this world. The fragment,
       * not the query, because that is where the real template puts it and
       * the reset page reads it from; and a path on this app, not a `mock://`
       * address, so the link can actually be followed (QA F15).
       */
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const token = Array.from({ length: 32 }, () => {
        ctx.sequence = (ctx.sequence * 1103515245 + 12345) % 2147483648;
        return alphabet[ctx.sequence % alphabet.length];
      }).join('');
      const expiresAtUtc = new Date(now().getTime() + 24 * 60 * 60_000).toISOString();
      const tokenHash = mockTokenHash(token);
      registry.signInLinks.set(tokenHash, {
        tokenHash,
        staffMemberId: subject.id,
        venueId,
        email: address,
        expiresAtUtc,
        spentAtUtc: null,
      });

      const link: StaffSignInLink = {
        staffMemberId: subject.id,
        email: address,
        resetLink: `/reset-password#token=${token}`,
        expiresAtUtc,
        replacedExistingSignIn: subject.hasPasswordSignIn,
      };
      return link;
    },

    async clearPinLockout({ branchId, staffMemberId }) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/staff`);
      const venueId = venueOfBranch(branchId);
      const list = venueId ? staffFor(venueId) : [];
      // `ClearPinLockoutAsync`: only somebody this branch's tablets would lock
      // out — at this branch, or venue-wide. A sibling branch's is cleared there.
      const index = list.findIndex(
        (member) =>
          member.id === staffMemberId && (member.branchId === null || member.branchId === branchId),
      );
      if (index < 0) throw new NotFoundError({ url: URL_TAG });
      list[index] = { ...list[index]!, isPinLocked: false };
    },
  };
}
