import { TabAccessEndedError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { tabAccessCopy } from './access';

/**
 * "The tab has closed, or you were taken off it" is what the server said. A tab
 * this device simply holds no token for — somebody else's link, or a tab opened
 * before tokens were kept — must not be told it closed.
 */
describe('what a lost tab says', () => {
  it('says the tab ended when the server refused this device', () => {
    const error = new TabAccessEndedError({ url: '/api/tabs/t', tabId: 't', status: 401 });

    expect(tabAccessCopy(error)).toEqual({
      title: 'tab.accessEnded.title',
      body: 'tab.accessEnded.body',
    });
  });

  it('asks for a scan, without claiming it closed, when this device was never on it', () => {
    const error = new TabAccessEndedError({ url: '/api/tabs/t', tabId: 't', notOnDevice: true });

    expect(tabAccessCopy(error)).toEqual({
      title: 'tab.notOnDevice.title',
      body: 'tab.notOnDevice.body',
    });
  });

  it('is nothing for any other failure', () => {
    expect(tabAccessCopy(new Error('offline'))).toBeNull();
  });
});
