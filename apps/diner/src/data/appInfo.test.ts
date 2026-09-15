import { describe, expect, it } from 'vitest';
import { appVersionFrom, legalLinks, supportContact } from './appInfo';

/**
 * Help and About never invent a contact or a link: what is shown is exactly
 * what is configured, and anything unset, blank or malformed is left out.
 */
describe('supportContact', () => {
  it('is null when nothing is configured, so Help draws no contact section', () => {
    expect(supportContact({})).toBeNull();
    expect(supportContact({ supportEmail: '  ', supportPhone: '' })).toBeNull();
  });

  it('turns a configured email and phone into mailto: and tel: links', () => {
    expect(
      supportContact({ supportEmail: ' help@example.test ', supportPhone: '+374 91 000 123' }),
    ).toEqual({
      email: { label: 'help@example.test', url: 'mailto:help@example.test' },
      phone: { label: '+374 91 000 123', url: 'tel:+37491000123' },
    });
  });

  it('shows only the half that is configured', () => {
    expect(supportContact({ supportPhone: '+37499000123' })).toEqual({
      email: null,
      phone: { label: '+37499000123', url: 'tel:+37499000123' },
    });
  });

  it('leaves out values that are not an address or a number', () => {
    expect(supportContact({ supportEmail: 'not-an-email', supportPhone: 'call us' })).toBeNull();
    expect(supportContact({ supportPhone: '12' })).toBeNull();
  });
});

describe('legalLinks', () => {
  it('lists only https URLs that are set', () => {
    expect(legalLinks({})).toEqual({ terms: null, privacy: null });
    expect(
      legalLinks({ termsUrl: 'https://example.test/terms', privacyUrl: 'http://example.test/p' }),
    ).toEqual({ terms: 'https://example.test/terms', privacy: null });
    expect(legalLinks({ termsUrl: 'not a url' }).terms).toBeNull();
  });
});

describe('appVersionFrom', () => {
  it("reads the version and the platform's build number from the app config", () => {
    const constants = {
      expoConfig: { version: '1.4.0', ios: { buildNumber: '27' }, android: { versionCode: 31 } },
    };
    expect(appVersionFrom(constants, 'ios')).toEqual({ version: '1.4.0', build: '27' });
    expect(appVersionFrom(constants, 'android')).toEqual({ version: '1.4.0', build: '31' });
  });

  it("does not report Expo Go's own build number as the app's", () => {
    const constants = {
      expoConfig: { version: '1.4.0' },
      nativeBuildVersion: '2.33.1',
      executionEnvironment: 'storeClient',
    };
    expect(appVersionFrom(constants, 'ios')).toEqual({ version: '1.4.0', build: null });
    expect(appVersionFrom({ ...constants, executionEnvironment: 'standalone' }, 'ios').build).toBe(
      '2.33.1',
    );
  });

  it('has no version when the config has none', () => {
    expect(appVersionFrom({ expoConfig: null }, 'web')).toEqual({ version: null, build: null });
  });
});
