import { cleanup, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../places/model';
import { mockPlaces } from '../../places/mockPlaces';
import { PlaceSummaryCard } from '../place/PlaceSummaryCard';
import { PlaceHeroCard } from './PlaceHeroCard';
import { PlaceRow } from './PlaceRow';
import type * as I18nModule from '@yalla/i18n';

/**
 * The venue is the title and the branch is its own line on every card a place
 * is listed on. One "Venue · Branch" line truncated at 375 pt to exactly the
 * part that tells two branches apart; a screen reader still hears both.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('../../stores/favorites', () => ({
  useIsFavorite: () => false,
  useFavorites: (select: (state: { toggle: () => void }) => unknown) =>
    select({ toggle: () => undefined }),
}));

const seed = mockPlaces.find((place) => place.venueName === 'Lumen Coffee')!;

const PLACE: Place = {
  ...seed,
  venueName: 'Lavash Restaurant',
  branchName: 'Northern Avenue',
  name: 'Lavash Restaurant · Northern Avenue',
  badges: [],
  photos: [],
  openState: { isOpen: true, todayLabel: '' },
};

/** A phone-width column, so the check is about the layout a person sees. */
function atPhoneWidth(children: React.ReactNode) {
  return render(<View style={{ width: 375 }}>{children}</View>);
}

function expectSeparateLines() {
  const venue = screen.getByText('Lavash Restaurant');
  const branch = screen.getByText('Northern Avenue');
  expect(venue).not.toBe(branch);
  expect(venue.contains(branch)).toBe(false);
  expect(branch.contains(venue)).toBe(false);
  // No text node still carries the joined one-line name.
  expect(document.body.textContent).not.toContain('Lavash Restaurant · Northern Avenue');
}

afterEach(cleanup);

describe('the venue / branch split on place cards', () => {
  it('PlaceHeroCard: venue and branch on separate lines, both in the label', () => {
    atPhoneWidth(<PlaceHeroCard place={PLACE} onPress={() => undefined} />);

    expectSeparateLines();
    expect(screen.getByLabelText(/^Lavash Restaurant · Northern Avenue\./)).toBeTruthy();
  });

  it('PlaceRow: venue and branch on separate lines, both in the label', () => {
    atPhoneWidth(
      <PlaceRow place={PLACE} onViewDetails={() => undefined} onDirections={() => undefined} />,
    );

    expectSeparateLines();
    expect(screen.getByLabelText('Lavash Restaurant · Northern Avenue')).toBeTruthy();
  });

  it('PlaceSummaryCard: venue and branch on separate lines, both in the label', () => {
    atPhoneWidth(<PlaceSummaryCard place={PLACE} onPress={() => undefined} />);

    expectSeparateLines();
    expect(screen.getAllByLabelText('Lavash Restaurant · Northern Avenue').length).toBeGreaterThan(
      0,
    );
  });

  it('adds no branch line for a branch named like its venue', () => {
    atPhoneWidth(
      <PlaceSummaryCard
        place={{ ...PLACE, branchName: 'lavash restaurant', name: 'Lavash Restaurant' }}
      />,
    );

    expect(screen.getByText('Lavash Restaurant')).toBeTruthy();
    expect(screen.queryByText('lavash restaurant')).toBeNull();
  });
});
