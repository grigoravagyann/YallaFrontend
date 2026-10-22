import { useIsFocused } from 'expo-router';
import { StatusBar, type StatusBarStyle } from 'expo-status-bar';

/**
 * A screen's own status-bar style, held only while that screen is the one in
 * front.
 *
 * React Native keeps status-bar styles as a stack: the last `<StatusBar>`
 * mounted wins until it unmounts. A pushed screen leaves the one under it
 * mounted, so a bare `<StatusBar style="light" />` on the place page stayed
 * in force on Book, Reviews and the booking flow — white clock and battery
 * on a white page (B2, 2026-10-22). Unmounting on blur hands the bar back to
 * whatever is underneath: the root layout's dark default, or the next
 * screen's own.
 */
export function FocusedStatusBar({ style }: { readonly style: StatusBarStyle }) {
  return useIsFocused() ? <StatusBar style={style} /> : null;
}
