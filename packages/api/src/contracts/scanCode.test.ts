import { describe, expect, it } from 'vitest';
import { extractScannedCode } from './scanCode';

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
    expect(extractScannedCode('  k7m 2-qp ')).toBe('K7M2QP');
    expect(extractScannedCode('K7M-2QP')).toBe('K7M2QP');
  });

  it('returns empty for input with nothing usable, so no round trip is wasted', () => {
    expect(extractScannedCode('   ')).toBe('');
    expect(extractScannedCode('')).toBe('');
  });
});
