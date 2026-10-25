import { LIFT_REASON_MIN, LIFT_REASON_MAX, type BookingBlock } from '../../contracts/guestRecord';
import { invalidRequest, validationFailed, type MockViolation } from '../problems';
import { NotFoundError, ConcurrencyConflictError } from '../../errors';
import {
  PLATFORM_NAME_MAX_LENGTH,
  PLATFORM_PASSWORD_MIN_LENGTH,
} from '../../contracts/platformHome';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';
import { ProblemCodes } from '../../generated/problemCodes';

/** The platform admin's Home and Settings: the overview, the outbox, booking blocks, activity, the admin's own profile and password. */
export function platformHomeMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'getPlatformOverview'
  | 'getOutboxHealth'
  | 'listBookingBlocks'
  | 'liftBookingBlock'
  | 'listPlatformActivity'
  | 'getPlatformProfile'
  | 'updatePlatformProfile'
  | 'changePlatformPassword'
> {
  const {
    activity,
    admin,
    blocks,
    log,
    now,
    outboxOf,
    overviewOf,
    requirePlatformAdmin,
    seedActivity,
    seedBlocks,
    wait,
  } = ctx;
  return {
    // --- Home and Settings ----------------------------------------------------

    async getPlatformOverview() {
      await wait();
      requirePlatformAdmin(`${URL_TAG}/platform/overview`);
      return overviewOf();
    },

    async getOutboxHealth() {
      await wait();
      requirePlatformAdmin(`${URL_TAG}/platform/outbox`);
      return outboxOf();
    },

    async listBookingBlocks() {
      await wait();
      requirePlatformAdmin(`${URL_TAG}/platform/booking-blocks`);
      seedBlocks();
      const t = now().getTime();
      return [...blocks.values()]
        .filter((block) => block.liftedAtUtc === null && Date.parse(block.blockedUntilUtc) > t)
        .sort((a, b) => b.blockedAtUtc.localeCompare(a.blockedAtUtc));
    },

    async liftBookingBlock({ blockId, reason }) {
      await wait();
      const url = `${URL_TAG}/platform/booking-blocks/${blockId}/lift`;
      requirePlatformAdmin(url);
      seedBlocks();
      const trimmed = reason.trim();
      if (trimmed.length < LIFT_REASON_MIN || trimmed.length > LIFT_REASON_MAX) {
        throw invalidRequest(
          url,
          'reason',
          `Say why, in ${LIFT_REASON_MIN} to ${LIFT_REASON_MAX} characters.`,
        );
      }
      const block = blocks.get(blockId);
      if (!block) throw new NotFoundError({ url });
      if (block.liftedAtUtc !== null) return block;
      if (Date.parse(block.blockedUntilUtc) <= now().getTime()) {
        throw new ConcurrencyConflictError({
          url,
          problem: {
            type: '',
            title: 'Conflict',
            status: 409,
            detail: 'The block has already ended.',
            code: ProblemCodes.ConflictingState,
            traceId: 'mock',
          },
        });
      }
      const lifted: BookingBlock = { ...block, liftedAtUtc: now().toISOString() };
      blocks.set(blockId, lifted);
      log(
        'booking-block.lift',
        { type: 'BookingBlock', id: blockId, name: block.dinerDisplayName ?? blockId },
        null,
      );
      return lifted;
    },

    async listPlatformActivity(query = {}) {
      await wait();
      const url = `${URL_TAG}/platform/activity`;
      requirePlatformAdmin(url);
      const limit = query.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw invalidRequest(url, 'limit', 'The limit is from 1 to 100.');
      }
      seedActivity();
      return activity
        .filter((entry) => !query.venueId || entry.venue?.id === query.venueId)
        .slice(0, limit);
    },

    async getPlatformProfile() {
      await wait();
      requirePlatformAdmin(`${URL_TAG}/platform/me`);
      return { staffMemberId: admin.staffMemberId, fullName: admin.fullName, email: admin.email };
    },

    async updatePlatformProfile({ fullName }) {
      await wait();
      const url = `${URL_TAG}/platform/me`;
      requirePlatformAdmin(url);
      const name = fullName.trim();
      if (name.length === 0) {
        throw validationFailed(url, [
          { field: 'fullName', message: 'The name is required.', bound: 'required' },
        ]);
      }
      if (name.length > PLATFORM_NAME_MAX_LENGTH) {
        throw validationFailed(url, [
          {
            field: 'fullName',
            message: `The name is at most ${PLATFORM_NAME_MAX_LENGTH} characters.`,
            bound: 'max',
            max: PLATFORM_NAME_MAX_LENGTH,
          },
        ]);
      }
      // An unchanged name writes nothing, as on the server.
      if (name !== admin.fullName) {
        const before = admin.fullName;
        admin.fullName = name;
        log('admin.rename', { type: 'StaffMember', id: admin.staffMemberId, name: before }, null);
      }
      return { staffMemberId: admin.staffMemberId, fullName: admin.fullName, email: admin.email };
    },

    async changePlatformPassword({ currentPassword, newPassword }) {
      await wait();
      const url = `${URL_TAG}/platform/me/password`;
      requirePlatformAdmin(url);
      // One 422 naming every field, in the server's order.
      const violations: MockViolation[] = [];
      if (!currentPassword) {
        violations.push({
          field: 'currentPassword',
          message: 'The current password is required.',
          bound: 'required',
        });
      } else if (currentPassword !== admin.password) {
        violations.push({
          field: 'currentPassword',
          message: 'The current password is wrong.',
          bound: 'conflict',
        });
      }
      if (!newPassword) {
        violations.push({
          field: 'newPassword',
          message: 'The new password is required.',
          bound: 'required',
        });
      } else if (newPassword.length < PLATFORM_PASSWORD_MIN_LENGTH) {
        violations.push({
          field: 'newPassword',
          message: `Password must be at least ${PLATFORM_PASSWORD_MIN_LENGTH} characters.`,
          bound: 'min',
          min: PLATFORM_PASSWORD_MIN_LENGTH,
        });
      }
      if (violations.length > 0) throw validationFailed(url, violations);
      admin.password = newPassword;
      log(
        'admin.password-change',
        { type: 'StaffMember', id: admin.staffMemberId, name: admin.fullName },
        null,
      );
      // As the server will: every other session ended, this one renewed.
      return { sessionRenewed: true };
    },
  };
}
