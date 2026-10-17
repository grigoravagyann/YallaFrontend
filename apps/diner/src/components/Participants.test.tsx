// @vitest-environment jsdom
import type { Photo } from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RosterPerson } from '../tab/roster';
import { AvatarRow, ParticipantRow } from './Participants';
import type * as I18nModule from '@yalla/i18n';

/**
 * Faces on the tab: a profile photo where there is one, the initial where
 * there is not — and the initial again when a photo never arrives, rather
 * than an image glyph where a face should be.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The photo as a marker. A link with "broken" in it fails the way a dead
// image does — `PhotoImage` reports a load of `null` and an error; one with
// "nosize" arrives on a platform that cannot say its size — a load of `null`
// and no error.
vi.mock('./PhotoImage', () => ({
  PhotoImage: ({
    source,
    onLoad,
    onError,
  }: {
    readonly source: string;
    readonly onLoad?: (size: { width: number; height: number } | null) => void;
    readonly onError?: () => void;
  }) => {
    useEffect(() => {
      if (source.includes('broken')) {
        onLoad?.(null);
        onError?.();
      } else if (source.includes('nosize')) onLoad?.(null);
      else onLoad?.({ width: 120, height: 120 });
    }, [source, onLoad, onError]);
    return <span data-testid="photo" data-src={source} />;
  },
}));

afterEach(cleanup);

function photo(thumbnailUrl: string): Photo {
  return {
    photoId: thumbnailUrl,
    thumbnailUrl,
    cardUrl: thumbnailUrl,
    fullUrl: thumbnailUrl,
    width: null,
    height: null,
  };
}

function person(
  participantId: string,
  displayName: string,
  overrides: Partial<RosterPerson> = {},
): RosterPerson {
  return {
    participantId,
    displayName,
    role: 'guest',
    status: 'approved',
    photo: null,
    isYou: false,
    ...overrides,
  };
}

describe('AvatarRow', () => {
  it('shows a photo, an initial and the +n for everyone else', () => {
    render(
      <AvatarRow
        people={[
          person('p1', 'Anna', { isYou: true, photo: photo('https://cdn.test/anna.jpg') }),
          person('p2', 'Gor'),
          person('p3', ''),
          person('p4', 'Nare', { status: 'pendingApproval' }),
        ]}
      />,
    );

    expect(screen.getByTestId('photo').getAttribute('data-src')).toBe('https://cdn.test/anna.jpg');
    expect(screen.getByText('G')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
    // Anna's face is her photo, so her initial is not drawn as well.
    expect(screen.queryByText('A')).toBeNull();
  });

  it('falls back to the initial when the photo does not load', () => {
    render(
      <AvatarRow
        people={[person('p1', 'Anna', { photo: photo('https://cdn.test/broken.jpg') })]}
      />,
    );

    expect(screen.queryByTestId('photo')).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('keeps a photo that arrived without saying its size', () => {
    render(
      <AvatarRow
        people={[person('p1', 'Anna', { photo: photo('https://cdn.test/nosize.jpg') })]}
      />,
    );

    expect(screen.getByTestId('photo').getAttribute('data-src')).toBe(
      'https://cdn.test/nosize.jpg',
    );
    expect(screen.queryByText('A')).toBeNull();
  });

  it('draws no +n when everyone fits', () => {
    render(<AvatarRow people={[person('p1', 'Anna'), person('p2', 'Gor')]} />);

    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('G')).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('is decorative: the card around it carries the names', () => {
    const { container } = render(<AvatarRow people={[person('p1', 'Anna')]} />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('ParticipantRow', () => {
  it('shows the person’s photo beside their name', () => {
    render(
      <ParticipantRow person={person('p2', 'Gor', { photo: photo('https://cdn.test/gor.jpg') })} />,
    );

    expect(screen.getByText('Gor')).toBeTruthy();
    expect(screen.getByTestId('photo').getAttribute('data-src')).toBe('https://cdn.test/gor.jpg');
  });

  it('shows the initial when there is no photo', () => {
    render(<ParticipantRow person={person('p2', 'Gor')} />);

    expect(screen.getByText('G')).toBeTruthy();
    expect(screen.queryByTestId('photo')).toBeNull();
  });
});
