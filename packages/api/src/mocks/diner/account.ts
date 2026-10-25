import { UnauthorizedError } from '../../errors';
import { PhoneNotVerifiedError, InvalidCredentialsError } from '../../contracts/errors';
import { validationFailed } from '../problems';
import { type DinerMockContext, URL_TAG, type MockGateway } from './context';

/** The diner's account. */
export function accountMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'registerDiner'
  | 'loginDiner'
  | 'getDinerProfile'
  | 'updateDinerProfile'
  | 'setDinerPassword'
  | 'uploadDinerPhoto'
  | 'removeDinerPhoto'
  | 'deleteDinerAccount'
> {
  const {
    accounts,
    bookingOwners,
    challenges,
    deletedAccounts,
    favorites,
    feeds,
    me,
    now,
    phoneProvedRecently,
    photoSeed,
    reviewStore,
    signIn,
    visits,
    wait,
  } = ctx;
  return {
    // --- The account --------------------------------------------------------

    async registerDiner(command) {
      await wait();
      return signIn(accounts.register(command), true);
    },

    async loginDiner(command) {
      await wait();
      return signIn(accounts.login(command), false);
    },

    async getDinerProfile() {
      await wait();
      const profile = accounts.profile(me());
      if (!profile) throw new UnauthorizedError({ url: `${URL_TAG}/api/diner/me` });
      return profile;
    },

    async updateDinerProfile(command) {
      await wait();
      return accounts.update(me(), command);
    },

    async setDinerPassword(command) {
      await wait();
      accounts.setPassword(me(), command, { phoneProvedAt: ctx.sessionPhoneProvedAt });
    },

    async uploadDinerPhoto(file) {
      await wait();
      return accounts.setPhoto(me(), photoSeed(file));
    },

    async removeDinerPhoto() {
      await wait();
      accounts.removePhoto(me());
    },

    /**
     * K2, in the server's order: `VerifiedDiner` first, then the confirmation
     * the account needs (the password when it has one, otherwise a code for its
     * own number — or nothing, when this session proved the phone in the last
     * ten minutes), then everything erased at once. The bookings stay for the
     * venue with nobody linked; the session answers `session-revoked` after.
     */
    async deleteDinerAccount({ password, code }) {
      await wait();
      const url = `${URL_TAG}/api/diner/me`;
      const accountId = me();
      const profile = accounts.profile(accountId);
      if (!profile) throw new UnauthorizedError({ url });
      if (!profile.phoneVerified) throw new PhoneNotVerifiedError({ url });

      if (profile.hasPassword) {
        if (!password) {
          throw validationFailed(url, [
            { field: 'password', message: 'Confirm with your password.', bound: 'required' },
          ]);
        }
        if (!accounts.passwordMatches(accountId, password)) {
          throw new InvalidCredentialsError({ url });
        }
      } else if (!code) {
        // A code or Telegram sign-in a moment ago is the proof a code here would
        // be — and with SMS off, the only one an account with no password has.
        if (!phoneProvedRecently()) {
          throw validationFailed(url, [
            {
              field: 'code',
              message:
                "Enter the code sent to the account's number, or prove the number with Telegram again, to delete it.",
              bound: 'required',
            },
          ]);
        }
      } else {
        const t = now().getTime();
        const challenge = [...challenges.values()].find(
          (entry) => entry.phoneE164 === profile.phoneE164 && !entry.burned && t <= entry.expiresAt,
        );
        if (!challenge || challenge.code !== code) throw new InvalidCredentialsError({ url });
        challenges.delete(challenge.id);
      }

      reviewStore.deleteByDiner(accountId);
      favorites.delete(accountId);
      feeds.delete(accountId);
      for (const [bookingId, owner] of bookingOwners) {
        if (owner === accountId) bookingOwners.delete(bookingId);
      }
      for (let i = visits.length - 1; i >= 0; i -= 1) {
        if (visits[i]!.dinerUserId === accountId) visits.splice(i, 1);
      }
      accounts.remove(accountId);
      deletedAccounts.add(accountId);
    },
  };
}
