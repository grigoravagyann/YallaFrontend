import { Stack } from 'expo-router';
import { STACK_OPTIONS } from '../../../src/components/nav/stackOptions';
import { TrayProvider } from '../../../src/order/TrayProvider';

/**
 * Everything under one tab, with the order tray above it.
 *
 * The provider sits here rather than at the app root so the tray belongs to a
 * tab: it survives moving between the menu, the tray and the bill, and it goes
 * when the app does. A basket is not a document.
 */
export default function TabLayout() {
  return (
    <TrayProvider>
      <Stack screenOptions={STACK_OPTIONS} />
    </TrayProvider>
  );
}
