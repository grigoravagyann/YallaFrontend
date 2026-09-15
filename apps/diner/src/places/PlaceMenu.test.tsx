import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceMenu } from './PlaceMenu';
import { placeRepository } from './repository';
import type * as I18nModule from '@yalla/i18n';

/**
 * The menu is a tab on a place's page, read on its own: when it fails the tab
 * says so and offers a retry that reads the menu again and nothing else, and a
 * place that has published no menu says that instead.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('./repository', () => ({
  placeRepository: {
    listNearby: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    tables: vi.fn(),
    menu: vi.fn(),
    reviewPage: vi.fn(),
  },
}));

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlaceMenu placeId="b1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(placeRepository.menu).mockReset();
});

describe('PlaceMenu', () => {
  it('shows Retry when the menu fails, and the retry reads only the menu again', async () => {
    vi.mocked(placeRepository.menu)
      .mockRejectedValueOnce(new Error('menu is down'))
      .mockResolvedValueOnce([
        {
          section: 'Coffee',
          items: [{ name: 'Flat white', price: 1200, description: 'Oat milk' }],
        },
      ]);

    renderMenu();

    expect(await screen.findByText('place.menu.error')).toBeTruthy();
    fireEvent.click(screen.getByText('net.retry'));

    expect(await screen.findByText('Flat white')).toBeTruthy();
    expect(screen.queryByText('place.menu.error')).toBeNull();
    expect(placeRepository.menu).toHaveBeenCalledTimes(2);
    expect(placeRepository.menu).toHaveBeenCalledWith('b1');
    expect(placeRepository.getById).not.toHaveBeenCalled();
  });

  it('says a place has published no menu, which is not a failure', async () => {
    vi.mocked(placeRepository.menu).mockResolvedValue([]);

    renderMenu();

    expect(await screen.findByText('place.menu.empty')).toBeTruthy();
    expect(screen.queryByText('net.retry')).toBeNull();
  });
});
