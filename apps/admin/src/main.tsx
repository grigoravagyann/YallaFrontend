import { createQueryClient, resolveApiConfig } from '@yalla/api';
import { I18nextProvider, createWebLocaleStorage, i18next, initI18n } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
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
  namespaces: ['common', 'admin'],
  defaultNamespace: 'admin',
  debug: import.meta.env.DEV,
});

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
