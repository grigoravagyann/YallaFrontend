/**
 * What the Help and About screens may show about the app and whoever runs it.
 *
 * Every contact and every policy link comes from configuration, never from the
 * code: a support address typed into a screen is one nobody may be reading, and
 * a "Terms" link to a page that does not exist is worse than no link. Unset,
 * blank or malformed means the line is left out.
 *
 * Expo inlines only `EXPO_PUBLIC_` variables, and only where the code names them
 * literally — so each is read by name in {@link readAppEnv}, not through a
 * computed key.
 */

export interface AppEnv {
  readonly supportEmail?: string | undefined;
  readonly supportPhone?: string | undefined;
  readonly termsUrl?: string | undefined;
  readonly privacyUrl?: string | undefined;
}

export function readAppEnv(): AppEnv {
  return {
    supportEmail: process.env['EXPO_PUBLIC_SUPPORT_EMAIL'],
    supportPhone: process.env['EXPO_PUBLIC_SUPPORT_PHONE'],
    termsUrl: process.env['EXPO_PUBLIC_TERMS_URL'],
    privacyUrl: process.env['EXPO_PUBLIC_PRIVACY_URL'],
  };
}

export interface SupportLine {
  /** What the diner reads: the address or the number as configured. */
  readonly label: string;
  /** What `Linking.openURL` opens: `mailto:` or `tel:`. */
  readonly url: string;
}

export interface SupportContact {
  readonly email: SupportLine | null;
  readonly phone: SupportLine | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function emailLine(value: string | undefined): SupportLine | null {
  const email = value?.trim() ?? '';
  return EMAIL.test(email) ? { label: email, url: `mailto:${email}` } : null;
}

function phoneLine(value: string | undefined): SupportLine | null {
  const phone = value?.trim() ?? '';
  // Digits with the usual separators, and enough of them to be a number.
  if (!/^\+?[\d\s().-]+$/u.test(phone)) return null;
  const dial = phone.replace(/[^\d+]/gu, '');
  return dial.replace(/\D/gu, '').length >= 6 ? { label: phone, url: `tel:${dial}` } : null;
}

/** The support contact, or `null` when none is configured — then Help shows no contact section. */
export function supportContact(env: AppEnv = readAppEnv()): SupportContact | null {
  const email = emailLine(env.supportEmail);
  const phone = phoneLine(env.supportPhone);
  return email || phone ? { email, phone } : null;
}

function httpsUrl(value: string | undefined): string | null {
  const raw = value?.trim() ?? '';
  if (raw === '') return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

export interface LegalLinks {
  readonly terms: string | null;
  readonly privacy: string | null;
}

export function legalLinks(env: AppEnv = readAppEnv()): LegalLinks {
  return { terms: httpsUrl(env.termsUrl), privacy: httpsUrl(env.privacyUrl) };
}

/** The parts of `expo-constants` the version line reads. */
export interface ConstantsLike {
  readonly expoConfig?: {
    readonly version?: string | undefined;
    readonly ios?: { readonly buildNumber?: string | undefined } | undefined;
    readonly android?: { readonly versionCode?: number | undefined } | undefined;
  } | null;
  readonly nativeBuildVersion?: string | null | undefined;
  /** `storeClient` is Expo Go, whose native build number is Expo Go's own. */
  readonly executionEnvironment?: string | undefined;
}

export interface AppVersion {
  readonly version: string | null;
  readonly build: string | null;
}

/**
 * The version from the app config, and the build number when there is an
 * honest one: the platform's from the config, else the installed binary's —
 * except inside Expo Go, where the binary is Expo Go and its number is not ours.
 */
export function appVersionFrom(constants: ConstantsLike, os: string): AppVersion {
  const config = constants.expoConfig ?? null;
  const version = config?.version?.trim() || null;
  const fromConfig =
    os === 'ios'
      ? config?.ios?.buildNumber
      : os === 'android' && config?.android?.versionCode !== undefined
        ? String(config.android.versionCode)
        : undefined;
  const fromBinary =
    constants.executionEnvironment === 'storeClient'
      ? undefined
      : (constants.nativeBuildVersion ?? undefined);
  const build = fromConfig?.trim() || fromBinary?.trim() || null;
  return { version, build };
}
