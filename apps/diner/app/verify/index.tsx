import { useLocalSearchParams } from 'expo-router';
import { PhoneAuthFlow, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';

/**
 * Phone verification, kept as a route for anything that still links to it
 * (older deep links, the public web page's wording). It is the log-in flow:
 * the same params, the same finish — a booking in hand is replaced onto its
 * confirmation, otherwise back to where the diner came from.
 *
 * Also where the Telegram bot sends the app back: `yalla://verify?tg=<id>`
 * resumes polling that challenge, so a diner who tapped the bot's button
 * lands on the waiting screen rather than on an empty number field.
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<AuthRouteParams>();
  return <PhoneAuthFlow mode="login" params={params} />;
}
