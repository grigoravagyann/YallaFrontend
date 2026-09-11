import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { JoinByLink } from '../../src/components/JoinByLink';

/**
 * `https://yalla.am/join/<token>` — the link the share sheet hands to WhatsApp
 * or Telegram, and `yalla://join/<token>` for the app-to-app case.
 *
 * Always an invitation, so it always goes to `/api/tabs/join`. The token keeps
 * its case: it is compared exactly.
 */
export default function JoinByInviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const code = useMemo(() => (token ? ({ kind: 'invite', token } as const) : null), [token]);
  return <JoinByLink code={code} />;
}
