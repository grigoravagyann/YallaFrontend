import { createQueryClient } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, createWebLocaleStorage, i18next, initI18n } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { authSession } from './auth/authSession';
import { useDevRole } from './auth/session';
import { consoleGatewayFor, staffDataGateway, staffGateway } from './data/gateway';
import { registerServiceWorker } from './offline/registerServiceWorker';

/**
 * `'online'`: an offline write waits for the connection rather than failing.
 *
 * The counter tablet's own command queue owns retry, and the wifi in a basement
 * drops for seconds at a time; failing a table transition the moment it does
 * would put a warning in front of a waiter who is mid-service and whose action
 * is about to succeed. A waiter is also standing in the room, which a diner is
 * not — `apps/diner` sets the opposite for that reason.
 */
const queryClient = createQueryClient({ mutationNetworkMode: 'online' });

/**
 * The data layer, as context.
 *
 * The console gateway is re-resolved when the dev role changes so the mock
 * can report a differently-scoped user; against a real backend the role
 * argument is ignored and this is a constant. The floor plan comes from the
 * same `YallaGateway` the phone uses, in its staff audience, so a diner and a
 * waiter cannot disagree about where table 7 is; everything a waiter *does* to
 * a table goes through the separate staff gateway.
 */
function Providers({ children }: { readonly children: ReactNode }) {
  const role = useDevRole((state) => state.role);
  const consoleGateway = useMemo(() => consoleGatewayFor(role), [role]);

  return (
    <GatewayProvider
      gateway={staffGateway}
      consoleGateway={consoleGateway}
      staffGateway={staffDataGateway}
    >
      {children}
    </GatewayProvider>
  );
}

export async function bootstrap(container: HTMLElement): Promise<void> {
  // i18n and the stored session are resolved before the first render so no
  // screen flashes an untranslated key, and so a returning user is not shown
  // the sign-in form for the half second it takes to read IndexedDB.
  await Promise.all([
    initI18n({
      deviceLocales: navigator.languages,
      storage: createWebLocaleStorage(),
      // `staff` too: this one app serves the console and the floor screen.
      namespaces: ['common', 'admin', 'staff'],
      defaultNamespace: 'admin',
      debug: import.meta.env.DEV,
    }),
    authSession.restore(),
  ]);

  // `BrowserRouter` rather than `createBrowserRouter`: the route tree is
  // derived from the signed-in role, so it has to be able to re-render inside
  // React when that resolves. A router built once at module scope cannot.
  createRoot(container).render(
    <StrictMode>
      <I18nextProvider i18n={i18next}>
        <QueryClientProvider client={queryClient}>
          <Providers>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </Providers>
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>,
  );

  // After the render, and after the two awaits above — which is exactly why it
  // cannot wait for `load`. See `registerServiceWorker`.
  registerServiceWorker();
}
