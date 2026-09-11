import { NotTabHostError, type DinerTabView } from '@yalla/api';

/**
 * Handing out an invitation, which only the host may do.
 *
 * The server's `POST /api/tabs/{id}/join-tokens` is host-only. The tab screen
 * offered Invite to every approved guest, and the invite screen answered the
 * refusal with "try again" and a retry that could never work.
 */

/** Whoever opened the tab, while they are on it: the rule the server applies. */
export function canInvite(view: Pick<DinerTabView, 'me'>): boolean {
  return view.me.role === 'host' && view.me.status === 'approved';
}

export interface InviteFailure {
  /** The sentence to show. */
  readonly key: string;
  /** Whether trying again can help. A refusal for not being the host never can. */
  readonly retry: boolean;
}

export function inviteFailure(error: unknown): InviteFailure {
  // The button reads a tab that can be a few seconds old, so the server's own
  // refusal still has to read as what it is.
  if (error instanceof NotTabHostError) return { key: 'invite.notHost', retry: false };
  return { key: 'invite.error', retry: true };
}
