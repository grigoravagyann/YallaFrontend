import { createQueryClient } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, createMemoryLocaleStorage, i18next, initI18n } from '@yalla/i18n';
import { PUBLIC_NAMESPACES, publicResources } from '@yalla/i18n/public';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { dinerGateway, publicGateway } from './gateways';
import { languageFromUrl } from './language';
import { PublicApp } from './PublicApp';
import './public.css';

/**
 * `'always'`: a write attempted with no connection fails rather than waits.
 *
 * The opposite of the console's choice, and for the same reason the diner app
 * makes it: a waiter is standing in the room and their action is about to
 * succeed, while somebody on a train going through a tunnel needs to be told
 * *now* that no table was held. A paused mutation here is a spinner that never
 * resolves and a person who turns up to a table they do not have.
 */
const queryClient = createQueryClient({ mutationNetworkMode: 'always' });

export async function bootstrapPublic(container: HTMLElement): Promise<void> {
  /*
   * Language is resolved before the first paint, and there is no stored
   * preference to wait for — see `language.ts`. `?lang=` beats the browser's
   * own list because somebody who was sent a link in Russian was sent it
   * deliberately; below that, `navigator.languages` decides, which is the whole
   * reason a tourist gets a page they can read without touching anything.
   */
  await initI18n({
    resources: publicResources,
    deviceLocales: [languageFromUrl(window.location.search), ...navigator.languages],
    // In memory: this page writes to no browser storage at all. The choice is
    // carried in the URL instead, which also makes it survive being forwarded.
    storage: createMemoryLocaleStorage(),
    namespaces: PUBLIC_NAMESPACES,
    defaultNamespace: 'public',
    debug: import.meta.env.DEV,
  });

  createRoot(container).render(
    <StrictMode>
      <I18nextProvider i18n={i18next}>
        <QueryClientProvider client={queryClient}>
          <GatewayProvider gateway={dinerGateway} publicGateway={publicGateway}>
            <BrowserRouter>
              <PublicApp />
            </BrowserRouter>
          </GatewayProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}
