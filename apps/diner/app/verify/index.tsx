import { useLocalSearchParams } from 'expo-router';
import { PhoneAuthFlow, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';

/**
 * Phone verification, kept as a route for anything that still links to it
 * (older deep links, the public web page's wording). It is the log-in flow:
 * the same params, the same finish — a booking in hand is replaced onto its
 * confirmation, otherwise back to where the diner came from.
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<AuthRouteParams>();
  return <PhoneAuthFlow mode="login" params={params} />;
}
