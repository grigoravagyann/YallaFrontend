import type { Photo } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { avatarStack, initialOf, peopleLine, type PeopleLineCopy } from './avatarStack';
import type { RosterPerson } from './roster';

/**
 * The people card: two faces, a "+n" for everyone else, and a line that names
 * exactly the faces shown — "Anna, Gor +1", as the design writes it.
 */

const PHOTO: Photo = {
  photoId: 'ph1',
  thumbnailUrl: 'https://cdn.test/anna-thumb.jpg',
  cardUrl: 'https://cdn.test/anna-card.jpg',
  fullUrl: 'https://cdn.test/anna.jpg',
  width: 600,
  height: 600,
};

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

const COPY: PeopleLineCopy = {
  youName: 'You',
  headCount: (count) => (count === 1 ? '1 person on this tab' : `${count} people on this tab`),
  namesMore: (names, more) => `${names} +${more}`,
};

describe('the stack of faces', () => {
  it('shows two named faces and folds everyone else into the +n', () => {
    const people = [
      person('p1', 'Anna', { isYou: true, role: 'host', photo: PHOTO }),
      person('p2', 'Gor'),
      person('p3', ''),
    ];
    const stack = avatarStack(people);

    expect(stack.shown.map((p) => p.participantId)).toEqual(['p1', 'p2']);
    expect(stack.folded).toBe(1);
    expect(peopleLine(people, COPY)).toBe('Anna, Gor +1');
  });

  it('folds named people past the stack too, and leaves out anyone not on the tab', () => {
    const people = [
      person('p1', 'Anna'),
      person('p2', 'Gor'),
      person('p3', 'Nare'),
      person('p4', 'Ani', { status: 'pendingApproval' }),
      person('p5', 'Aram', { status: 'removed' }),
    ];

    expect(avatarStack(people).folded).toBe(1);
    expect(peopleLine(people, COPY)).toBe('Anna, Gor +1');
  });

  it('calls this phone "You" when it has no name, and never counts it as a guest', () => {
    const people = [person('p1', '', { isYou: true }), person('p2', ' ')];

    expect(avatarStack(people).shown.map((p) => p.participantId)).toEqual(['p1']);
    expect(peopleLine(people, COPY)).toBe('You +1');
  });

  it('names everyone with no "+" when they all fit', () => {
    expect(peopleLine([person('p1', 'Anna'), person('p2', 'Gor')], COPY)).toBe('Anna, Gor');
  });

  it('counts heads, plural-aware, when nobody on the tab has a name', () => {
    expect(peopleLine([person('p2', ''), person('p3', '')], COPY)).toBe('2 people on this tab');
    expect(peopleLine([], COPY)).toBe('');
  });
});

describe('an initial', () => {
  it('is the first character as read, never half of a surrogate pair', () => {
    expect(initialOf('anna')).toBe('A');
    expect(initialOf('  գոռ')).toBe('Գ');
    expect(initialOf('😀 Nare')).toBe('😀');
    expect(initialOf('')).toBe('');
  });
});
