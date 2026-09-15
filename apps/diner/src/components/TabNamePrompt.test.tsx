import { TabAccessEndedError, type TabParticipantChange } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../stores/session';
import { TabNamePrompt, forgetTabNamePrompts } from './TabNamePrompt';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * Somebody who scanned with no name reaches the host as "Guest 2". The prompt
 * offers a name once, sends it to the tab, and never shows for someone who
 * already has one.
 */

const gateway = vi.hoisted(() => ({ setTabDisplayName: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));

const CHANGE: TabParticipantChange = {
  participantId: 'p2',
  displayName: 'Tigran',
  role: 'guest',
  status: 'pendingApproval',
  permissions: { canOrder: true, canSeeTableTotal: true, canPay: false },
};

function renderPrompt(currentName: string | null, tabId = 'tab-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <TabNamePrompt tabId={tabId} currentName={currentName} />
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

beforeEach(() => {
  gateway.setTabDisplayName.mockReset();
  useSession.setState({ signedIn: false, profile: null, phoneE164: null, guestName: null });
});

afterEach(() => {
  cleanup();
  forgetTabNamePrompts();
});

describe('TabNamePrompt', () => {
  it('names a "Guest 2" on the tab and remembers the name on the phone', async () => {
    gateway.setTabDisplayName.mockResolvedValue(CHANGE);
    const { invalidate } = renderPrompt('Guest 2');

    expect(screen.getByText('tab.name.title')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('tab.name.title'), { target: { value: '  Tigran ' } });
    fireEvent.click(screen.getByRole('button', { name: 'tab.name.save' }));

    await waitFor(() => expect(gateway.setTabDisplayName).toHaveBeenCalledWith('tab-1', 'Tigran'));
    await waitFor(() => expect(screen.queryByText('tab.name.title')).toBeNull());
    expect(useSession.getState().guestName).toBe('Tigran');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dinerTab', 'tab-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tabShares', 'tab-1'] });
  });

  it('is not shown to somebody who already has a name', () => {
    renderPrompt('Anahit');
    expect(screen.queryByText('tab.name.title')).toBeNull();
  });

  it('is shown for a blank name, prefilled with the name remembered on the phone', () => {
    useSession.setState({ guestName: 'Ani' });
    renderPrompt('');
    expect((screen.getByLabelText('tab.name.title') as HTMLInputElement).value).toBe('Ani');
  });

  it('sends nothing for a blank name', () => {
    renderPrompt('Guest 3');
    fireEvent.click(screen.getByRole('button', { name: 'tab.name.save' }));
    expect(gateway.setTabDisplayName).not.toHaveBeenCalled();
  });

  it('"Not now" hides it for that tab, and it stays hidden when the screen changes', () => {
    const first = renderPrompt('Guest 2');
    fireEvent.click(screen.getByRole('button', { name: 'tab.name.skip' }));
    expect(screen.queryByText('tab.name.title')).toBeNull();
    first.unmount();

    renderPrompt('Guest 2');
    expect(screen.queryByText('tab.name.title')).toBeNull();
    cleanup();

    // A different tab is a different table: asked again.
    renderPrompt('Guest 2', 'tab-2');
    expect(screen.getByText('tab.name.title')).toBeTruthy();
  });

  it('says so when the name did not go through, and stays open', async () => {
    gateway.setTabDisplayName.mockRejectedValue(new Error('offline'));
    renderPrompt('Guest 2');

    fireEvent.change(screen.getByLabelText('tab.name.title'), { target: { value: 'Tigran' } });
    fireEvent.click(screen.getByRole('button', { name: 'tab.name.save' }));

    expect(await screen.findByText('people.failed')).toBeTruthy();
    expect(screen.getByText('tab.name.title')).toBeTruthy();
    expect(useSession.getState().guestName).toBeNull();
  });

  it('says the tab has ended when this phone is no longer on it', async () => {
    gateway.setTabDisplayName.mockRejectedValue(
      new TabAccessEndedError({ url: '/api/tabs/tab-1/display-name', tabId: 'tab-1', status: 403 }),
    );
    renderPrompt('Guest 2');

    fireEvent.change(screen.getByLabelText('tab.name.title'), { target: { value: 'Tigran' } });
    fireEvent.click(screen.getByRole('button', { name: 'tab.name.save' }));

    expect(await screen.findByText('tab.accessEnded.body')).toBeTruthy();
  });
});
