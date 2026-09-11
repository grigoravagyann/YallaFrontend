import { describe, expect, it } from 'vitest';
import { extractScannedCode, parseScannedCode } from './scanCode';

describe('extractScannedCode', () => {
  it('takes the last segment of the https url a table sticker encodes', () => {
    expect(extractScannedCode('https://yalla.am/t/K7M2QP')).toBe('K7M2QP');
  });

  it('handles the custom scheme the app registers for deep links', () => {
    expect(extractScannedCode('yalla://t/K7M2QP')).toBe('K7M2QP');
  });

  it('drops the query and fragment a share sheet may add', () => {
    expect(extractScannedCode('https://yalla.am/join/inv_9?utm=wa#top')).toBe('inv_9');
  });

  it('leaves an invite token exactly as published, because it is case sensitive', () => {
    expect(extractScannedCode('https://yalla.am/join/inv_AbC9')).toBe('inv_AbC9');
  });

  it('forgives the spaces and dashes people add when typing the fallback code', () => {
    expect(extractScannedCode('  K7M 2-QP ')).toBe('K7M2QP');
    expect(extractScannedCode('K7M-2QP')).toBe('K7M2QP');
  });

  it("keeps the case of what was typed: a sticker's token is lower-case hex", () => {
    // The console prints the raw 32-character token under the QR. Upper-casing
    // it only ever matched because the column ignored case.
    expect(extractScannedCode('a3f09c1e5b7d42e8a0c6f1b29d4e8c7a')).toBe(
      'a3f09c1e5b7d42e8a0c6f1b29d4e8c7a',
    );
    expect(extractScannedCode('a3f0 9c1e 5b7d')).toBe('a3f09c1e5b7d');
  });

  it('returns empty for input with nothing usable, so no round trip is wasted', () => {
    expect(extractScannedCode('   ')).toBe('');
    expect(extractScannedCode('')).toBe('');
  });
});

describe('parseScannedCode', () => {
  it("reads the host's invitation link as an invitation, not a table", () => {
    expect(parseScannedCode('https://yalla.am/join/Zx9_Ab-12')).toEqual({
      kind: 'invite',
      token: 'Zx9_Ab-12',
    });
  });

  it('reads the older ?token= form of the link too', () => {
    expect(parseScannedCode('http://localhost:5173/join?token=Zx9_Ab-12')).toEqual({
      kind: 'invite',
      token: 'Zx9_Ab-12',
    });
  });

  it('reads a sticker, a /t/ link and typed input as a table code', () => {
    expect(parseScannedCode('a3f09c1e5b7d42e8a0c6f1b29d4e8c7a')).toEqual({
      kind: 'table',
      code: 'a3f09c1e5b7d42e8a0c6f1b29d4e8c7a',
    });
    expect(parseScannedCode('https://yalla.am/t/K7M2QP')).toEqual({
      kind: 'table',
      code: 'K7M2QP',
    });
  });

  it('says there is nothing when there is nothing', () => {
    expect(parseScannedCode('  ')).toEqual({ kind: 'none' });
  });
});
