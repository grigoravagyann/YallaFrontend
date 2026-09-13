import { useLocalSearchParams } from 'expo-router';
import { PhoneAuthFlow, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';

/**
 * Log in with an SMS code: a phone number, the code, then the name if this
 * phone has never remembered one. Also how an account confirms its number —
 * the profile's "Verify" opens this, and verifying refreshes the profile.
 */
export default function CodeLoginScreen() {
  const params = useLocalSearchParams<AuthRouteParams>();
  return <PhoneAuthFlow mode="login" params={params} />;
}
