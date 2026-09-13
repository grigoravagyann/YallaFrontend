import { useLocalSearchParams } from 'expo-router';
import { PhoneAuthFlow, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';

/**
 * Create account: the name the venue asks for, the phone number verified by
 * SMS code, and an optional email — the last two kept only on this phone.
 */
export default function SignupScreen() {
  const params = useLocalSearchParams<AuthRouteParams>();
  return <PhoneAuthFlow mode="signup" params={params} />;
}
