import {
  ConcurrencyConflictError,
  ForbiddenError,
  NotTabHostError,
  TabAccessEndedError,
  isOffline,
  type TabShares,
} from '@yalla/api';

/**
 * Settling up: who hosts, and why a change of mode did not take.
 */

/**
 * Mark the host on every share.
 *
 * `/shares` does not say who hosts, so the gateway reports `isHost` false for
 * everyone; the tab read does, through `hostParticipantId`. Without this the
 * "opened the tab" badge never showed.
 */
export function withHost(shares: TabShares, hostParticipantId: string | null): TabShares {
  const mark = <T extends { participantId: string }>(share: T): T & { isHost: boolean } => ({
    ...share,
    isHost: hostParticipantId !== null && share.participantId === hostParticipantId,
  });
  const yourShare = shares.yourShare ? mark(shares.yourShare) : null;
  return shares.kind === 'table'
    ? { ...shares, yourShare, shares: shares.shares.map(mark) }
    : { ...shares, yourShare };
}

/**
 * A refused change of settlement mode, as its sentence.
 *
 * It used to vanish: no error handler, nothing rendered. The server stamps the
 * lock on the first attempt after a payment exists and answers that attempt
 * with 409, so a 409 **is** "locked". A 403 is the host rule or a tab whose
 * bill has been asked for.
 */
export function settlementModeFailureKey(error: unknown): string {
  if (error instanceof NotTabHostError) return 'settle.mode.notHost';
  if (error instanceof ConcurrencyConflictError) return 'settle.mode.locked';
  if (error instanceof TabAccessEndedError) return 'tab.accessEnded.body';
  if (error instanceof ForbiddenError) return 'settle.mode.closing';
  if (isOffline(error)) return 'net.offline';
  return 'settle.mode.failed';
}
