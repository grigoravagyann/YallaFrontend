import { createQueryClient, resolveApiConfig } from '@yalla/api';
import { I18nextProvider, createWebLocaleStorage, i18next, initI18n } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { registerServiceWorker } from './offline/registerServiceWorker';
import './index.css';

/** Vite exposes only `VITE_`-prefixed env vars to the client bundle. */
export const apiConfig = resolveApiConfig(import.meta.env['VITE_API_BASE_URL']);

const queryClient = createQueryClient();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

// i18n is initialised before the first render so no screen ever flashes an
// untranslated key while the bundle decides what language it is in.
await initI18n({
  deviceLocales: navigator.languages,
  storage: createWebLocaleStorage(),
  // `staff` too: this one app serves the console and the floor screen.
  namespaces: ['common', 'admin', 'staff'],
  defaultNamespace: 'admin',
  debug: import.meta.env.DEV,
});

// `BrowserRouter` rather than `createBrowserRouter`: the route tree is derived
// from the signed-in role, so it has to be able to re-render inside React when
// that resolves. A router built once at module scope cannot.
createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);

registerServiceWorker();
