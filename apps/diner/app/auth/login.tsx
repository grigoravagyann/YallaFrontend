import { useLocalSearchParams } from 'expo-router';
import { PhoneAuthFlow, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';

/**
 * Log in: a phone number verified by SMS code, then the name if this phone
 * has never remembered one. Opened with the booking being made, when there
 * is one, so that finishing lands on its confirmation.
 */
export default function LoginScreen() {
  const params = useLocalSearchParams<AuthRouteParams>();
  return <PhoneAuthFlow mode="login" params={params} />;
}
