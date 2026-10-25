import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelegramChallenge, VerifiedPhone } from '../contracts/booking';
import { ExpiredCodeError, TelegramUnavailableError } from '../contracts/errors';
import { useGateway } from './gateways';
import { queryKeys } from './queryKeys';

/**
 * Verifying a number through the Telegram bot, as one hook for both surfaces.
 *
 * The shape is the same on the public web page and in the phone app: start a
 * challenge, send the person to the bot, poll the claim at the cadence the
 * server asked for until the bot has confirmed or the challenge has aged out.
 * Where the two differ — how Telegram is opened, what "try again" looks like —
 * is markup, and stays in the screens.
 *
 * Polling is a query, not a loop: `refetchInterval` is the server's
 * `pollAfterMs` while the challenge is pending and `false` once it is not, and
 * `refetchOnWindowFocus` means coming back from Telegram asks straight away
 * rather than waiting out the interval. On the phone, `AppState` drives focus
 * (see the diner's `lib/queryManagers`).
 */

export type TelegramVerificationStatus =
  /** Nothing started. */
  | 'idle'
  /** The start request is out. */
  | 'starting'
  /** The bot has the diner; the claim is being polled. */
  | 'pending'
  /** The bot confirmed; `onVerified` has been called. */
  | 'verified'
  /** The challenge aged out before the bot confirmed. Start again. */
  | 'expired'
  /** The backend has Telegram switched off: hide the button. */
  | 'unavailable'
  /** Start failed for another reason; `error` says which. */
  | 'failed';

export interface UseTelegramVerificationOptions {
  /** The diner's language, so the bot and the account use it. */
  readonly localeCode?: string | undefined;
  /** The bot confirmed. Called once per challenge. */
  readonly onVerified: (verified: VerifiedPhone) => void;
  /** The challenge aged out before the bot confirmed. Called once per challenge. */
  readonly onExpired?: (() => void) | undefined;
}

export interface TelegramVerification {
  /**
   * Start a challenge. Resolves with it so a caller that opened a window
   * synchronously (to dodge popup blockers) can point it at the deep link.
   * Rejects with what the gateway threw; `status` and `error` already say.
   */
  start(): Promise<TelegramChallenge>;
  /**
   * Pick up polling a challenge started elsewhere — the bot's "back to the
   * app" button carries the id. No deep link and no expiry are known for it;
   * the server's expiry answer ends it.
   */
  resume(challengeId: string): void;
  readonly status: TelegramVerificationStatus;
  /** The bot's deep link, once started. `null` while idle or resumed. */
  readonly deepLinkUrl: string | null;
  /** What `start` failed with, for the screen's copy. */
  readonly error: unknown;
  /** Forget the challenge: back to `idle`. */
  reset(): void;
}

/** A resumed challenge carries no cadence; this is how often it is asked. */
const RESUME_POLL_MS = 2000;

interface Tracked {
  readonly challengeId: string;
  readonly deepLinkUrl: string | null;
  /** `null` for a resumed challenge, whose expiry only the server knows. */
  readonly expiresAtMs: number | null;
  readonly pollAfterMs: number;
}

export function useTelegramVerification(
  options: UseTelegramVerificationOptions,
): TelegramVerification {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const { localeCode } = options;

  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [clockExpired, setClockExpired] = useState(false);

  // The callbacks as the latest render gave them, read from effects only.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  }, [options]);

  const startMutation = useMutation({
    mutationFn: () => gateway.startTelegramVerification({ localeCode }),
    retry: false,
  });
  const { mutateAsync: startRequest, reset: resetStart } = startMutation;

  const polling = tracked !== null && !clockExpired;

  const claim = useQuery({
    queryKey: queryKeys.telegramClaim(tracked?.challengeId ?? ''),
    queryFn: () => gateway.claimTelegramVerification(tracked!.challengeId, { localeCode }),
    enabled: polling,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      if (!polling) return false;
      const data = query.state.data;
      if (data?.state === 'verified') return false;
      if (query.state.error instanceof ExpiredCodeError) return false;
      return tracked.pollAfterMs;
    },
  });

  const verified = claim.data?.state === 'verified' ? claim.data.verified : null;
  const serverExpired = claim.error instanceof ExpiredCodeError;

  // The challenge's own expiry, from the clock: polling stops without another
  // round trip, and the screen says "expired" at the moment the link dies.
  useEffect(() => {
    if (tracked === null || tracked.expiresAtMs === null) return;
    const id = setTimeout(
      () => setClockExpired(true),
      Math.max(0, tracked.expiresAtMs - Date.now()),
    );
    return () => clearTimeout(id);
  }, [tracked]);

  // Each outcome is reported once per challenge, however many renders see it.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!tracked || reported.current === tracked.challengeId) return;
    if (verified) {
      reported.current = tracked.challengeId;
      callbacks.current.onVerified(verified);
    } else if (serverExpired || clockExpired) {
      reported.current = tracked.challengeId;
      callbacks.current.onExpired?.();
    }
  }, [tracked, verified, serverExpired, clockExpired]);

  const start = useCallback(async (): Promise<TelegramChallenge> => {
    setTracked(null);
    setClockExpired(false);
    const issued = await startRequest();
    setTracked({
      challengeId: issued.challengeId,
      deepLinkUrl: issued.deepLinkUrl,
      expiresAtMs: Date.parse(issued.expiresAtUtc),
      pollAfterMs: issued.pollAfterMs,
    });
    return issued;
  }, [startRequest]);

  const resume = useCallback(
    (challengeId: string) => {
      resetStart();
      setClockExpired(false);
      setTracked({
        challengeId,
        deepLinkUrl: null,
        expiresAtMs: null,
        pollAfterMs: RESUME_POLL_MS,
      });
    },
    [resetStart],
  );

  const reset = useCallback(() => {
    resetStart();
    setTracked(null);
    setClockExpired(false);
    void queryClient.removeQueries({ queryKey: queryKeys.telegramClaim('').slice(0, 1) });
  }, [resetStart, queryClient]);

  let status: TelegramVerificationStatus = 'idle';
  if (startMutation.isPending) status = 'starting';
  else if (startMutation.isError)
    status = startMutation.error instanceof TelegramUnavailableError ? 'unavailable' : 'failed';
  else if (tracked) {
    if (verified) status = 'verified';
    else if (serverExpired || clockExpired) status = 'expired';
    else status = 'pending';
  }

  return {
    start,
    resume,
    status,
    deepLinkUrl: tracked?.deepLinkUrl ?? null,
    error: startMutation.error,
    reset,
  };
}
