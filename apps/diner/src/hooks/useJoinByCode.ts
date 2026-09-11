import { parseScannedCode, type ScanResult, type ScannedCode } from '@yalla/api';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useJoinTab, useOpenTabByBooking, useScanTableCode } from '../data/queries';
import { newCommandId } from '../lib/commandId';
import {
  gateFor,
  scanFailureFor,
  scanWasRefused,
  type BranchClock,
  type ScanFailure,
} from '../lib/scanOutcome';
import { useSession } from '../stores/session';
import { useActiveTab } from '../stores/tab';

/**
 * Turning a code — scanned, typed or arrived via a link — into a tab, and
 * getting the diner to the right screen afterwards.
 *
 * Three doors, three endpoints. A table's QR opens or joins that table's tab
 * (`/api/tabs/open`); a host's invitation joins the tab it was made for
 * (`/api/tabs/join`); the diner's own booking code opens the tab on the table
 * they booked (`/api/tabs/open-by-booking`). The first two used to share the
 * table scan, which answered every invitation with "that code does not match a
 * table" — and the third had nowhere to go at all, so a diner holding a booking
 * for table 5 typed its code into the scanner and got that same answer about a
 * table they were sitting at.
 *
 * The command id for a table or booking code is kept per *code*, not per
 * attempt: retrying the same code replays one command and the backend hands
 * back the tab it already opened, which is what stops one table ending up with
 * two tabs. It is dropped only when the server definitely refused — after a
 * timeout the attempt may have opened a tab, and the same id is what gets that
 * tab back.
 */
export interface JoinByCodeOptions {
  /**
   * The branch whose clock a refusal's times are read in, when the screen knows
   * it — the booking screen does, the scan screen does not. Without it a
   * refusal drops the time rather than guessing a zone.
   */
  readonly at?: BranchClock | undefined;
}

export function useJoinByCode({ at }: JoinByCodeOptions = {}) {
  const router = useRouter();
  const scan = useScanTableCode();
  const joinByInvite = useJoinTab();
  const openByBooking = useOpenTabByBooking();
  const signedIn = useSession((s) => s.signedIn);
  const join = useActiveTab((s) => s.join);

  const [failure, setFailure] = useState<ScanFailure | null>(null);
  /** The offer to verify is on screen, waiting on the diner rather than taking them. */
  const [signInNeeded, setSignInNeeded] = useState(false);
  /** code -> command id, so a retry of the same code is the same command. */
  const commandIds = useRef(new Map<string, string>());
  /** A booking code that arrived with no session, kept for the way back. */
  const afterSignIn = useRef<ScannedCode | null>(null);

  // Depended on by their parts, not as an object: a screen passing this inline
  // would otherwise rebuild `enter` on every render.
  const zone = at?.timeZoneId;
  const locale = at?.locale;

  const enter = useCallback(
    async (code: ScannedCode): Promise<ScanResult | null> => {
      if (code.kind === 'none') {
        setFailure({ key: 'scan.error.empty' });
        return null;
      }

      /*
       * Scanning needs no account and never will — that is the whole flow. A
       * booking is the one thing here with an account behind it, and only the
       * account that made it may open its table, so this is the single door
       * that asks who you are.
       *
       * It asks, and does not act. This used to push straight to verification,
       * which meant six mistyped characters of the code alphabet took a diner
       * off the scan screen and into an SMS they never asked for — on a screen
       * whose own promise is "no sign-up and no phone number". The offer is
       * shown instead and the diner taps it; the code is held either way, so
       * they do not have to find it again on the way back.
       */
      const gate = gateFor(code, signedIn);
      if (gate.kind === 'signIn') {
        afterSignIn.current = code;
        setSignInNeeded(true);
        setFailure(gate.failure);
        return null;
      }

      setFailure(null);
      setSignInNeeded(false);

      try {
        let result: ScanResult;
        if (code.kind === 'invite') {
          result = await joinByInvite.mutateAsync({ joinToken: code.token });
        } else {
          let commandId = commandIds.current.get(code.code);
          if (!commandId) {
            commandId = newCommandId();
            commandIds.current.set(code.code, commandId);
          }
          try {
            result =
              code.kind === 'table'
                ? await scan.mutateAsync({ tableCode: code.code, commandId })
                : await openByBooking.mutateAsync({ bookingCode: code.code, commandId });
          } catch (error) {
            if (scanWasRefused(error)) commandIds.current.delete(code.code);
            throw error;
          }
        }

        join(result.tab.tabId);

        // `replace`, not `push`: nobody wants the camera behind them in the
        // stack, and Android back from the tab should leave the tab, not
        // reopen the scanner and rescan.
        router.replace(
          result.kind === 'joinPending'
            ? { pathname: '/tab/[tabId]/pending', params: { tabId: result.tab.tabId } }
            : { pathname: '/tab/[tabId]', params: { tabId: result.tab.tabId } },
        );
        return result;
      } catch (error) {
        setFailure(
          scanFailureFor(error, zone && locale ? { timeZoneId: zone, locale } : undefined),
        );
        return null;
      }
    },
    [scan, joinByInvite, openByBooking, join, router, signedIn, zone, locale],
  );

  /** Whatever the camera read or the diner typed: a table code, a booking code or an invite link. */
  const submit = useCallback((raw: string) => enter(parseScannedCode(raw)), [enter]);

  /**
   * Finish the booking code that was waiting on a session.
   *
   * Called when the screen comes back into focus after verification. Without
   * it, a diner who was sent to confirm their number returns to a screen that
   * has forgotten why they left.
   */
  const resumeAfterSignIn = useCallback(() => {
    const pending = afterSignIn.current;
    if (!pending || !signedIn) return;
    afterSignIn.current = null;
    void enter(pending);
  }, [enter, signedIn]);

  /**
   * The diner taking up the offer to verify, by tapping it.
   *
   * The only thing in here that navigates on a booking code with no session,
   * and it runs from a press rather than from what somebody typed.
   */
  const confirmNumber = useCallback(() => {
    router.push('/verify');
  }, [router]);

  return {
    submit,
    enter,
    resumeAfterSignIn,
    failure,
    signInNeeded,
    confirmNumber,
    clearFailure: useCallback(() => {
      setFailure(null);
      setSignInNeeded(false);
    }, []),
    isWorking: scan.isPending || joinByInvite.isPending || openByBooking.isPending,
  };
}
