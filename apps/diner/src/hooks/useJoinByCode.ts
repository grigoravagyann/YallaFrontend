import { extractScannedCode, type ScanResult } from '@yalla/api';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useScanTableCode } from '../data/queries';
import { newCommandId } from '../lib/commandId';
import { scanFailureFor, type ScanFailure } from '../lib/scanOutcome';
import { useActiveTab } from '../stores/tab';

/**
 * Turning a code — scanned, typed or arrived via a link — into a tab, and
 * getting the diner to the right screen afterwards.
 *
 * All three entry points share this so that a double scan, a retry after a
 * timeout and a link opened twice all behave the same way. The command id is
 * generated per *code*, not per attempt: retrying the same code replays one
 * command and the backend hands back the tab it already opened, which is what
 * stops one table ending up with two tabs.
 */
export function useJoinByCode() {
  const router = useRouter();
  const scan = useScanTableCode();
  const join = useActiveTab((s) => s.join);

  const [failure, setFailure] = useState<ScanFailure | null>(null);
  /** code -> command id, so a retry of the same code is the same command. */
  const commandIds = useRef(new Map<string, string>());

  const submit = useCallback(
    async (raw: string): Promise<ScanResult | null> => {
      const tableCode = extractScannedCode(raw);
      if (!tableCode) {
        setFailure({ key: 'scan.error.empty' });
        return null;
      }

      setFailure(null);

      let commandId = commandIds.current.get(tableCode);
      if (!commandId) {
        commandId = newCommandId();
        commandIds.current.set(tableCode, commandId);
      }

      try {
        const result = await scan.mutateAsync({ tableCode, commandId });
        join(result.tab.id);

        // `replace`, not `push`: nobody wants the camera behind them in the
        // stack, and Android back from the tab should leave the tab, not
        // reopen the scanner and rescan.
        router.replace(
          result.kind === 'joinPending'
            ? { pathname: '/tab/[tabId]/pending', params: { tabId: result.tab.id } }
            : { pathname: '/tab/[tabId]', params: { tabId: result.tab.id } },
        );
        return result;
      } catch (error) {
        // A failed scan must leave nothing behind: drop the command id so the
        // next attempt is a genuinely new command rather than replaying one the
        // server may have half-processed.
        commandIds.current.delete(tableCode);
        setFailure(scanFailureFor(error));
        return null;
      }
    },
    [scan, join, router],
  );

  return {
    submit,
    failure,
    clearFailure: useCallback(() => setFailure(null), []),
    isWorking: scan.isPending,
  };
}
