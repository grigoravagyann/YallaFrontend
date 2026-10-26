import type {
  DinerPhotoFile,
  DinerProfileView,
  DinerSignInResult,
  RegisterDinerCommand,
  UpdateDinerProfileCommand,
} from '../../contracts/dinerAccount';
import type { Photo } from '../../contracts/menuAdmin';
import {
  EmailTakenError,
  InvalidCredentialsError,
  PhoneInUseError,
  PhoneNotVerifiedError,
  RateLimitedError,
  TooManyAttemptsError,
  UsernameTakenError,
} from '../../contracts/errors';
import { ApiError, ForbiddenError, TooManyRequestsError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import { dinerProfile } from '../dinerMapping';
import { photoRejectionFrom } from '../photoErrors';
import { absolutePhoto } from '../photoUrl';
import { photo } from '../venueSettingsMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import type { DinerHttpContext } from './context';

type Schemas = components['schemas'];

export function accountMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'registerDiner'
  | 'loginDiner'
  | 'getDinerProfile'
  | 'updateDinerProfile'
  | 'setDinerPassword'
  | 'uploadDinerPhoto'
  | 'removeDinerPhoto'
  | 'deleteDinerAccount'
> {
  const { client, dinerAuth, readProfile, signedIn } = ctx;
  /**
   * The account refusals, each by its own code.
   *
   * Three 409s for three fields, and one 401 that is deliberately not an
   * {@link UnauthorizedError}: `invalid-credentials` means the password did not
   * match, not that a session ended, and a screen routing to sign-in over it
   * would send somebody already on the sign-in screen to the sign-in screen.
   * Anything unrecognised keeps the client's own mapping — a 400 is already a
   * `ValidationError` naming the field.
   */
  function rethrowAccount(error: unknown): never {
    if (error instanceof ApiError) {
      const base = { url: error.url, requestId: error.requestId };
      switch (error.problem?.code) {
        case ProblemCodes.UsernameTaken:
          throw new UsernameTakenError(base);
        case ProblemCodes.EmailTaken:
          throw new EmailTakenError(base);
        case ProblemCodes.PhoneInUse:
          throw new PhoneInUseError(base);
        case ProblemCodes.InvalidCredentials:
          throw new InvalidCredentialsError(base);
        default:
          break;
      }
    }
    throw error;
  }

  /** `POST /api/auth/diner/register`, as the wire spells the command. */
  function registerBody(
    command: RegisterDinerCommand,
  ): Schemas['Yalla.Api.Endpoints.RegisterDinerRequest'] {
    return {
      username: command.username,
      email: command.email,
      password: command.password,
      phoneE164: command.phoneE164,
      displayName: command.displayName,
      localeCode: command.localeCode ?? null,
    };
  }

  /** `PUT /api/diner/me`: only the fields present, so an absent one is left alone. */
  function profileBody(
    command: UpdateDinerProfileCommand,
  ): Schemas['Yalla.Api.Endpoints.UpdateDinerProfileRequest'] {
    return {
      ...(command.displayName !== undefined ? { displayName: command.displayName } : {}),
      ...(command.username !== undefined ? { username: command.username } : {}),
      ...(command.email !== undefined ? { email: command.email } : {}),
    };
  }

  /**
   * The multipart body for an avatar. One `file` part, whichever platform.
   *
   * React Native's `FormData` takes `{ uri, name, type }` and reads the bytes
   * from the uri itself; the web's takes a `Blob`. The cast is the platform
   * difference and nothing else — the DOM typings do not know about the native
   * shape, and the native runtime does not care about the DOM's.
   */
  function photoForm(file: DinerPhotoFile): FormData {
    const form = new FormData();
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      const name = 'name' in file && typeof file.name === 'string' ? file.name : 'photo';
      form.append('file', file, name);
    } else {
      form.append('file', file as unknown as Blob);
    }
    return form;
  }

  return {
    // --- The account --------------------------------------------------------------

    /**
     * `POST /api/auth/diner/register`. Signs the diner in on the way out, like
     * verify-code. Rate limited like request-code, so the 429 is the same
     * {@link RateLimitedError} with the server's `Retry-After` when it sent one.
     */
    async registerDiner(command): Promise<DinerSignInResult> {
      try {
        return await signedIn(await dinerAuth.register(registerBody(command)));
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          throw new RateLimitedError({
            url: error.url,
            retryAtUtc:
              error.retryAfterSeconds !== null
                ? new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString()
                : null,
          });
        }
        rethrowAccount(error);
      }
    },

    /** `POST /api/auth/diner/login`. Ten misses in fifteen minutes burns the identifier. */
    async loginDiner(command): Promise<DinerSignInResult> {
      try {
        return await signedIn(
          await dinerAuth.login({
            identifier: command.identifier,
            password: command.password,
            localeCode: command.localeCode ?? null,
          }),
        );
      } catch (error) {
        if (error instanceof TooManyRequestsError)
          throw new TooManyAttemptsError({ url: error.url });
        rethrowAccount(error);
      }
    },

    /** `GET /api/diner/me`, under the diner's own token. */
    getDinerProfile: readProfile,

    async updateDinerProfile(command): Promise<DinerProfileView> {
      try {
        const { data } = await client.put<Schemas['Yalla.Application.Diners.DinerProfileView']>(
          '/api/diner/me',
          profileBody(command),
        );
        return dinerProfile(data, client.baseUrl);
      } catch (error) {
        rethrowAccount(error);
      }
    },

    /**
     * `PUT /api/diner/me/password`. `currentPassword` is sent only when given:
     * an SMS-made account has none to send, and the server reads its absence as
     * "first password", not as an empty one.
     */
    async setDinerPassword(command): Promise<void> {
      try {
        await client.put('/api/diner/me/password', {
          ...(command.currentPassword !== undefined
            ? { currentPassword: command.currentPassword }
            : {}),
          newPassword: command.newPassword,
        } satisfies Schemas['Yalla.Api.Endpoints.SetDinerPasswordRequest']);
      } catch (error) {
        rethrowAccount(error);
      }
    },

    /**
     * `POST /api/diner/me/photo`, multipart, through the client — so the diner's
     * token, the refresh-on-401 and the typed errors all apply. No progress bar:
     * an avatar is one small square, not an eight-megabyte menu photo.
     */
    async uploadDinerPhoto(file): Promise<Photo> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Media.PhotoView']>(
          '/api/diner/me/photo',
          photoForm(file),
        );
        return absolutePhoto(client.baseUrl, photo(data));
      } catch (error) {
        throw photoRejectionFrom(error);
      }
    },

    async removeDinerPhoto(): Promise<void> {
      await client.delete('/api/diner/me/photo');
    },

    /**
     * `DELETE /api/diner/me` (K2), with the password or the code in the body —
     * or neither, when the bearer carries a phone proof from the last ten minutes.
     *
     * Deliberately does **not** sign the session out: the server has already
     * revoked it, and the caller's sign-out also clears the diner-scoped cache,
     * which this layer cannot see. The next diner call answers
     * `SessionRevokedError` until it does.
     */
    async deleteDinerAccount({ password, code }): Promise<void> {
      try {
        await client.delete('/api/diner/me', {
          body: {
            password: password ?? null,
            code: code ?? null,
          } satisfies Schemas['Yalla.Api.Endpoints.DeleteDinerAccountRequest'],
        });
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          throw new TooManyAttemptsError({ url: error.url });
        }
        if (
          error instanceof ForbiddenError &&
          error.problem?.code === ProblemCodes.PhoneNotVerified
        ) {
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        }
        rethrowAccount(error);
      }
    },
  };
}
