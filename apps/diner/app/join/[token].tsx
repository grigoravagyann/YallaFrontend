import { useLocalSearchParams } from 'expo-router';
import { JoinByLink } from '../../src/components/JoinByLink';

/**
 * `https://yalla.am/join/<token>` — the link the share sheet hands to WhatsApp
 * or Telegram, and `yalla://join/<token>` for the app-to-app case.
 */
export default function JoinByInviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <JoinByLink code={token} />;
}
