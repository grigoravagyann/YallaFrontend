import { isTabAccessEnded } from '@yalla/api';

/** The title and body keys for a tab this device cannot read, or `null`. */
export interface TabAccessCopy {
  readonly title: 'tab.accessEnded.title' | 'tab.notOnDevice.title';
  readonly body: 'tab.accessEnded.body' | 'tab.notOnDevice.body';
}

/**
 * What to say when a tab cannot be read on this device.
 *
 * The server's refusal is "closed, or taken off it" — it answers both with the
 * same bare 401/403, so the copy does not guess which. A tab this device holds
 * no participant token for was never refused by anyone: the diner is asked to
 * scan the table, and nothing claims the tab closed.
 */
export function tabAccessCopy(error: unknown): TabAccessCopy | null {
  if (!isTabAccessEnded(error)) return null;
  return error.notOnDevice
    ? { title: 'tab.notOnDevice.title', body: 'tab.notOnDevice.body' }
    : { title: 'tab.accessEnded.title', body: 'tab.accessEnded.body' };
}
