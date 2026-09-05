import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { emptyTray, trayReducer, type TrayAction, type TrayState } from './tray';

/**
 * The tray, held for as long as the app is running.
 *
 * React state in a provider above the tab's screens, deliberately: **the tray
 * survives a screen change but not an app restart.** A basket that comes back
 * three hours later is a document, and a diner who taps send on one is ordering
 * food they decided against at lunchtime.
 *
 * Nothing is written to storage — not `AsyncStorage`, not anything else. There
 * is no `localStorage` or `sessionStorage` anywhere in this app, and a tray does
 * not need durability: an unsent order is not work anybody has committed to.
 */

interface TrayContextValue {
  readonly state: TrayState;
  readonly dispatch: (action: TrayAction) => void;
}

const TrayContext = createContext<TrayContextValue | null>(null);

export function TrayProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(trayReducer, emptyTray);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <TrayContext.Provider value={value}>{children}</TrayContext.Provider>;
}

export function useTray(): TrayContextValue {
  const value = useContext(TrayContext);
  if (!value) throw new Error('useTray: wrap the screen in <TrayProvider>.');
  return value;
}
