import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp';

function directive(policy: string, name: string): readonly string[] {
  const entry = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/u))
    .find(([head]) => head === name);
  return entry ? entry.slice(1) : [];
}

describe('contentSecurityPolicy', () => {
  it('allows photos hosted outside the API, which legacy menu photos are', () => {
    const images = directive(
      contentSecurityPolicy({ apiUrl: 'https://api.yalla.test' }),
      'img-src',
    );
    expect(images).toContain('https:');
    expect(images).toContain('https://api.yalla.test');
  });

  it('allows external photos on a mock build too, and still no plain http host', () => {
    const images = directive(contentSecurityPolicy(), 'img-src');
    expect(images).toContain('https:');
    expect(images).not.toContain('http:');
  });

  it('keeps scripts to its own origin', () => {
    expect(
      directive(contentSecurityPolicy({ apiUrl: 'https://api.yalla.test' }), 'script-src'),
    ).toEqual(["'self'"]);
  });
});
