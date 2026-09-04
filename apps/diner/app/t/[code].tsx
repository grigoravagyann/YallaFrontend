import { useLocalSearchParams } from 'expo-router';
import { JoinByLink } from '../../src/components/JoinByLink';

/**
 * `https://yalla.am/t/<code>` — what the QR sticker on a table encodes.
 *
 * Present so that a phone whose own camera app grabs the QR before Yalla does
 * still ends up in the right place, rather than at a page that tells them to
 * open an app they already have open.
 */
export default function JoinByTableCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinByLink code={code} />;
}
