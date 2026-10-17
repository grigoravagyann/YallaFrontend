import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../places/model';
import { mockPlaces } from '../../places/mockPlaces';
import { PlaceSummaryCard } from '../place/PlaceSummaryCard';
import { PlaceHeroCard } from './PlaceHeroCard';
import { PlaceRow } from './PlaceRow';
import { PlaceRowCard, placeArea } from './PlaceRowCard';
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
  rooms: [],
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

  it('PlaceHeroCard: no empty part in the label when the distance is not known', () => {
    // QA 20261016T2 B8: "…4.2 (5). . Open".
    atPhoneWidth(
      <PlaceHeroCard place={{ ...PLACE, distanceKm: null }} onPress={() => undefined} />,
    );
    const label = screen.getByLabelText(/^Lavash Restaurant · Northern Avenue\./u);
    expect(label.getAttribute('aria-label')).not.toMatch(/\.\s*\./u);
  });

  it('PlaceRowCard: venue and branch on separate lines, both in the label', () => {
    atPhoneWidth(<PlaceRowCard place={PLACE} onPress={() => undefined} />);

    expectSeparateLines();
    expect(screen.getByLabelText(/^Lavash Restaurant · Northern Avenue\./)).toBeTruthy();
  });

  it('PlaceRowCard: no empty part in the label when the distance is not known', () => {
    atPhoneWidth(<PlaceRowCard place={{ ...PLACE, distanceKm: null }} onPress={() => undefined} />);
    const label = screen.getByLabelText(/^Lavash Restaurant · Northern Avenue\./u);
    expect(label.getAttribute('aria-label')).not.toMatch(/\.\s*\./u);
  });

  it('PlaceRowCard: one button for the place, named by it first, and the heart beside it', () => {
    const onPress = vi.fn();
    atPhoneWidth(<PlaceRowCard place={PLACE} onPress={onPress} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Lavash Restaurant · Northern Avenue\./u),
      'place.favorite',
    ]);
    fireEvent.click(buttons[0]!);
    expect(onPress).toHaveBeenCalledWith(PLACE.id);
  });

  it('PlaceRowCard: the area line is the address up to its first comma for a one-branch venue', () => {
    const single = { ...PLACE, branchName: '', name: 'Lavash Restaurant' };
    expect(placeArea(single)).toBe('5 Northern Avenue');
    expect(placeArea(PLACE)).toBe('Northern Avenue');

    atPhoneWidth(<PlaceRowCard place={single} onPress={() => undefined} />);
    expect(screen.getByText('5 Northern Avenue')).toBeTruthy();
    expect(screen.getByLabelText(/^Lavash Restaurant\./u)).toBeTruthy();
  });

  it('PlaceRowCard: today’s hours beside the Open badge', () => {
    atPhoneWidth(
      <PlaceRowCard
        place={{ ...PLACE, openState: { isOpen: true, todayLabel: '08:00 – 23:00' } }}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('08:00 – 23:00')).toBeTruthy();
    expect(screen.getByText('place.status.open')).toBeTruthy();
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
