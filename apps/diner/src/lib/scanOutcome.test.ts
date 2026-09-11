import { InviteExpiredError, NetworkError, TabsNotEnabledError, TimeoutError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { scanFailureFor, scanWasRefused } from './scanOutcome';

const url = 'https://api.test/api/tabs/open';

describe('a scan that did not work', () => {
  it('says ordering is not switched on here, rather than "try again"', () => {
    expect(scanFailureFor(new TabsNotEnabledError({ url })).key).toBe('scan.error.notEnabled');
  });

  it('says an invitation has expired, so the host makes a new one', () => {
    expect(scanFailureFor(new InviteExpiredError({ url })).key).toBe('join.error.expired');
  });

  it('does not claim nothing was opened after a timeout', () => {
    expect(scanFailureFor(new TimeoutError({ url, timeoutMs: 15_000 })).key).toBe(
      'scan.error.uncertain',
    );
    // And keeps the command, so scanning again replays rather than opens twice.
    expect(scanWasRefused(new TimeoutError({ url, timeoutMs: 15_000 }))).toBe(false);
    expect(scanWasRefused(new NetworkError({ url }))).toBe(true);
  });
});
