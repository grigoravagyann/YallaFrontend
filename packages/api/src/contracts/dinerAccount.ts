import type { TokenPair } from '../auth/session';
import type { Photo } from './menuAdmin';

/**
 * Diner accounts: a username, an email and a password beside the phone.
 *
 * SMS stays the one way a phone number gets verified. Registering with a number
 * does **not** verify it — `phoneVerified` is false until the diner passes a
 * code once — and a venue that reads the number off a booking should be able
 * to tell the difference, which is why the flag travels on the profile.
 */

/**
 * What every sign-in endpoint hands the diner app: the token pair the session
 * is started from, plus who it is for.
 *
 * One shape for register, login and verify-code — `DinerSignInResult` on the
 * wire — so the three doors into the app end in the same place.
 */
export interface DinerSignInResult extends TokenPair {
  readonly dinerUserId: string;
  /** True when this call created the account. Always true for register. */
  readonly isNewAccount: boolean;
}

/** `GET /api/diner/me`. */
export interface DinerProfileView {
  readonly dinerUserId: string;
  /** Null for an account made by SMS that has never set one. */
  readonly username: string | null;
  readonly email: string | null;
  readonly phoneE164: string;
  /** Whether the number has ever passed the SMS code. Registering alone does not. */
  readonly phoneVerified: boolean;
  readonly displayName: string | null;
  readonly localeCode: string;
  /** False for an SMS-made account, which sets its first password with no current one. */
  readonly hasPassword: boolean;
  /**
   * The avatar, with its links already absolute — resolved against the API's
   * origin at the gateway, like every other photo.
   */
  readonly photo: Photo | null;
}

/**
 * `POST /api/auth/diner/register`.
 *
 * The rules are the server's and it refuses with a `400` naming the field;
 * they are repeated here only so a form can say them as helper text:
 * `username` 3–30 of `a-z`, `0-9`, `.` and `_`, starting with a letter or digit
 * (stored lowercased); `email` a valid address up to 320; `password` 8–128 and
 * not equal to the username or the email; `phoneE164` in E.164;
 * `displayName` 1–100, required because the venue asks for it at the door.
 */
export interface RegisterDinerCommand {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly phoneE164: string;
  readonly displayName: string;
  /** The diner's language, stored against the account. */
  readonly localeCode?: string | undefined;
}

/** `POST /api/auth/diner/login`. `identifier` is a username or an email, either case. */
export interface LoginDinerCommand {
  readonly identifier: string;
  readonly password: string;
  readonly localeCode?: string | undefined;
}

/**
 * `PUT /api/diner/me`. Only the fields present change; an absent one is left
 * alone, and the same rules and the same 409s as registering apply.
 */
export interface UpdateDinerProfileCommand {
  readonly displayName?: string | undefined;
  readonly username?: string | undefined;
  readonly email?: string | undefined;
}

/**
 * `PUT /api/diner/me/password`.
 *
 * An account that has no password yet — made by SMS — sets one with no
 * `currentPassword`. One that has a password must send the current one, and a
 * wrong one is refused as `invalid-credentials`.
 */
export interface SetDinerPasswordCommand {
  readonly currentPassword?: string | undefined;
  readonly newPassword: string;
}

/**
 * A file as React Native's `FormData` takes it: a local `uri`, a `name` for
 * the part's filename and its MIME `type`. This is what `expo-image-picker`
 * hands back, and RN's `FormData` reads the bytes from the uri itself.
 */
export interface NativeFile {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
}

/**
 * What `uploadDinerPhoto` accepts: a {@link NativeFile} on React Native, a
 * `Blob` (or `File`) on the web. Both are appended as the multipart `file`
 * part; which one a caller has is decided by the platform, not by the gateway.
 */
export type DinerPhotoFile = NativeFile | Blob;
