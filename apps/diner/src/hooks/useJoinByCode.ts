import { parseScannedCode, type ScanResult, type ScannedCode } from '@yalla/api';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useJoinTab, useScanTableCode } from '../data/queries';
import { newCommandId } from '../lib/commandId';
import { scanFailureFor, scanWasRefused, type ScanFailure } from '../lib/scanOutcome';
import { useActiveTab } from '../stores/tab';

/**
 * Turning a code — scanned, typed or arrived via a link — into a tab, and
 * getting the diner to the right screen afterwards.
 *
 * Two doors, two endpoints. A table's QR opens or joins that table's tab
 * (`/api/tabs/open`); a host's invitation joins the tab it was made for
 * (`/api/tabs/join`). They used to share the table scan, which answered every
 * invitation with "that code does not match a table".
 *
 * The command id for a table scan is kept per *code*, not per attempt: retrying
 * the same code replays one command and the backend hands back the tab it
 * already opened, which is what stops one table ending up with two tabs. It is
 * dropped only when the server definitely refused — after a timeout the scan
 * may have opened a tab, and the same id is what gets that tab back.
 */
export function useJoinByCode() {
  const router = useRouter();
  const scan = useScanTableCode();
  const joinByInvite = useJoinTab();
  const join = useActiveTab((s) => s.join);

  const [failure, setFailure] = useState<ScanFailure | null>(null);
  /** table code -> command id, so a retry of the same code is the same command. */
  const commandIds = useRef(new Map<string, string>());

  const enter = useCallback(
    async (code: ScannedCode): Promise<ScanResult | null> => {
      if (code.kind === 'none') {
        setFailure({ key: 'scan.error.empty' });
        return null;
      }

      setFailure(null);

      try {
        let result: ScanResult;
        if (code.kind === 'table') {
          let commandId = commandIds.current.get(code.code);
          if (!commandId) {
            commandId = newCommandId();
            commandIds.current.set(code.code, commandId);
          }
          try {
            result = await scan.mutateAsync({ tableCode: code.code, commandId });
          } catch (error) {
            if (scanWasRefused(error)) commandIds.current.delete(code.code);
            throw error;
          }
        } else {
          result = await joinByInvite.mutateAsync({ joinToken: code.token });
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
        setFailure(scanFailureFor(error));
        return null;
      }
    },
    [scan, joinByInvite, join, router],
  );

  /** Whatever the camera read or the diner typed: a table code or an invite link. */
  const submit = useCallback((raw: string) => enter(parseScannedCode(raw)), [enter]);

  return {
    submit,
    enter,
    failure,
    clearFailure: useCallback(() => setFailure(null), []),
    isWorking: scan.isPending || joinByInvite.isPending,
  };
}
