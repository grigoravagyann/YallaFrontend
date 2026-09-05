import { describe, expect, it } from 'vitest';
import {
  ApiConfigError,
  deriveBaseUrlFromHost,
  resolveApiConfig,
  resolveDataSource,
} from './config';

const input = (baseUrl: string | undefined) => ({
  baseUrl,
  envVar: 'EXPO_PUBLIC_API_URL',
  example: 'http://192.168.1.42:5086',
});

describe('resolveApiConfig', () => {
  it('accepts an origin and strips a trailing slash', () => {
    expect(resolveApiConfig(input('http://192.168.1.42:5086/')).baseUrl).toBe(
      'http://192.168.1.42:5086',
    );
  });

  it('fails loudly when the variable is missing, naming it and giving an example', () => {
    expect(() => resolveApiConfig(input(undefined))).toThrow(ApiConfigError);
    expect(() => resolveApiConfig(input('   '))).toThrow(/EXPO_PUBLIC_API_URL is not set/u);
    expect(() => resolveApiConfig(input(undefined))).toThrow(/192\.168\.1\.42:5086/u);
  });

  it('rejects a value that is not a URL', () => {
    expect(() => resolveApiConfig(input('localhost:5086'))).toThrow(/not a URL|http/u);
    expect(() => resolveApiConfig(input('ftp://backend'))).toThrow(/http:\/\/ or https:\/\//u);
  });

  it('rejects a URL with a path, query or fragment — it must be an origin', () => {
    expect(() => resolveApiConfig(input('http://localhost:5086/api'))).toThrow(/no path/u);
    expect(() => resolveApiConfig(input('http://localhost:5086?x=1'))).toThrow(/no path/u);
  });
});

describe('resolveDataSource', () => {
  it('defaults to real', () => {
    expect(resolveDataSource(undefined, 'VITE_DATA_SOURCE')).toBe('real');
    expect(resolveDataSource('', 'VITE_DATA_SOURCE')).toBe('real');
  });

  it('accepts mock and real in any case', () => {
    expect(resolveDataSource('mock', 'VITE_DATA_SOURCE')).toBe('mock');
    expect(resolveDataSource('REAL', 'VITE_DATA_SOURCE')).toBe('real');
  });

  it('refuses a typo rather than silently picking one', () => {
    expect(() => resolveDataSource('mocks', 'VITE_DATA_SOURCE')).toThrow(/VITE_DATA_SOURCE/u);
  });
});

describe('deriveBaseUrlFromHost', () => {
  it('swaps the Expo dev server port for the backend port', () => {
    expect(deriveBaseUrlFromHost('192.168.1.42:8081')).toBe('http://192.168.1.42:5086');
  });

  it('tolerates a scheme and a path on the host string', () => {
    expect(deriveBaseUrlFromHost('exp://192.168.1.42:8081/--/venue')).toBe(
      'http://192.168.1.42:5086',
    );
  });

  it('returns undefined when there is no dev server host', () => {
    expect(deriveBaseUrlFromHost(undefined)).toBeUndefined();
    expect(deriveBaseUrlFromHost('')).toBeUndefined();
  });
});
