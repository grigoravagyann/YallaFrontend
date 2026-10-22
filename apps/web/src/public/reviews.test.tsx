// @vitest-environment jsdom
import { createMockReviewStore } from '@yalla/api';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { reviewAge } from './ReviewsSection';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * Reviews on the branch page (Main artboard): the average and how many, the
 * spread of stars, the newest first with the venue's replies signed as the
 * server signs them, and "see all" paging through the rest.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
  // Ages on the page are read from the clock; the reviews from the mock's `now`.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = new Date('2026-10-16T16:00:00Z');
const FRIDAY_EVENING = () => NOW;
const LUMEN = '/lumen-coffee/northern-avenue';

async function reviewsRegion() {
  const region = await screen.findByRole('region', { name: 'Reviews' });
  await within(region).findAllByRole('article');
  return region;
}

describe('the reviews summary', () => {
  it("draws the spread for any number of reviews from the server's counts, reading no page for it", async () => {
    const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
    const pages = vi.spyOn(harness.gateway, 'getBranchReviews');
    render(harness.wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();

    const summary = region.querySelector<HTMLElement>('.pub-review-summary')!;
    expect(within(summary).getByText(/^\d\.\d$/u)).toBeDefined();
    expect(within(summary).getByText('24 reviews')).toBeDefined();
    // Twenty-four reviews and twenty to a page: the spread comes from
    // `ratingCounts`, the whole branch's, so no page is read to draw it.
    const detail = await harness.gateway.getBranchDetail('b-lumen-north');
    const counts = detail!.ratingCounts;
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(24);
    const spread = await within(region).findByRole('img', { name: /^How guests rated it/u });
    expect(spread.getAttribute('aria-label')).toBe(
      `How guests rated it: 5 stars: ${counts[4]}, 4 stars: ${counts[3]}, 3 stars: ${counts[2]}, ` +
        `2 stars: ${counts[1]}, 1 star: ${counts[0]}`,
    );
    await settle();
    expect(pages).not.toHaveBeenCalled();
  });

  it('reads the rating once: the big number is for the eye, the stars say it', async () => {
    const reviews = storeWith([5, 4]);
    render(createHarness({ now: FRIDAY_EVENING, reviews }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    const summary = region.querySelector<HTMLElement>('.pub-review-summary')!;
    expect(summary.querySelector('.pub-review-average')?.getAttribute('aria-hidden')).toBe('true');
    const stars = within(summary).getByRole('img', { name: '4.5 out of 5' });
    // Four and a half, drawn as four and a half rather than rounded up to five.
    expect(stars.querySelectorAll('.pub-star')).toHaveLength(4);
    expect(stars.querySelectorAll('.pub-star-half')).toHaveLength(1);
  });

  it('draws the spread of stars when every review is in hand', async () => {
    const reviews = createMockReviewStore({ now: FRIDAY_EVENING });
    const ratings = [5, 5, 4, 5, 2];
    ratings.forEach((rating, index) =>
      reviews.save({
        branchId: 'b-lumen-north',
        dinerUserId: `diner-${index}`,
        displayName: `Guest Number${index}`,
        rating,
        text: `Visit ${index}`,
        atUtc: new Date(NOW.getTime() - (index + 1) * 86_400_000).toISOString(),
      }),
    );
    render(createHarness({ now: FRIDAY_EVENING, reviews }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();

    const spread = await within(region).findByRole('img', { name: /^How guests rated it/u });
    expect(spread.getAttribute('aria-label')).toBe(
      'How guests rated it: 5 stars: 3, 4 stars: 1, 3 stars: 0, 2 stars: 1, 1 star: 0',
    );
    expect(within(region).getByText('4.2')).toBeDefined();
    expect(within(region).getByText('5 reviews')).toBeDefined();
  });

  it('says there are none yet, and who may write one', async () => {
    render(createHarness({ now: FRIDAY_EVENING }).wrap(<PublicApp />, LUMEN));
    const region = await screen.findByRole('region', { name: 'Reviews' });
    expect(await within(region).findByText('No reviews yet.')).toBeDefined();
    expect(
      within(region).getByText('Only guests who came here through SHURJ can leave a review.'),
    ).toBeDefined();
    expect(within(region).queryByRole('button')).toBeNull();
  });
});

/** A store with one review per rating, newest first in the order given. */
function storeWith(ratings: readonly number[]) {
  const reviews = createMockReviewStore({ now: FRIDAY_EVENING });
  ratings.forEach((rating, index) =>
    reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: `diner-${index}`,
      displayName: `Guest Number${index}`,
      rating,
      text: `Visit ${index}`,
      atUtc: new Date(NOW.getTime() - (index + 1) * 86_400_000).toISOString(),
    }),
  );
  return reviews;
}

/** Let pending promises and the re-renders they cause land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('the reviews', () => {
  it('shows the newest three first, each with its stars, and the venue’s reply signed short', async () => {
    render(createHarness({ now: FRIDAY_EVENING, showcase: true }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    const cards = within(region).getAllByRole('article');
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Ani M.',
      'Davit K.',
      'Mariam S.',
    ]);
    expect(within(cards[0]!).getByRole('img', { name: '5 stars' })).toBeDefined();
    expect(within(cards[1]!).getByRole('img', { name: '4 stars' })).toBeDefined();

    // The reply under it, signed with the short public name the server sends.
    const reply = cards[1]!.querySelector('.pub-review-reply')!;
    expect(reply.textContent).toMatch(/^Reply from Aram H\., owner/u);
    expect(cards[0]!.querySelector('.pub-review-reply')).toBeNull();
  });

  it('pages through all of them on "see all", and folds back', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
    const pages = vi.spyOn(harness.gateway, 'getBranchReviews');
    render(harness.wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();

    const toggle = within(region).getByRole('button', { name: 'See all 24 reviews' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(20));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Show fewer');

    await userEvent.click(within(region).getByRole('button', { name: 'Show more reviews' }));
    await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(24));
    expect(within(region).queryByRole('button', { name: 'Show more reviews' })).toBeNull();
    expect(pages).toHaveBeenCalledWith({ branchId: 'b-lumen-north', page: 1 });
    expect(pages).toHaveBeenCalledWith({ branchId: 'b-lumen-north', page: 2 });

    // Newest first across the pages: the last is the oldest.
    const names = within(region)
      .getAllByRole('article')
      .map((card) => within(card).getByRole('heading').textContent);
    expect(names[0]).toBe('Ani M.');
    expect(names[23]).toBe('Gor A.');

    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    await userEvent.click(within(region).getByRole('button', { name: 'Show fewer' }));
    expect(within(region).getAllByRole('article')).toHaveLength(3);
    // Twenty cards folded away above the button: the section's heading is
    // brought back into view rather than leaving the visitor deep in the hours.
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(within(region).getByRole('heading', { level: 2 }));
  });

  it('shows each review once when one is published between two pages', async () => {
    const reviews = createMockReviewStore({ now: FRIDAY_EVENING, showcase: true });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(createHarness({ now: FRIDAY_EVENING, reviews }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();

    await userEvent.click(within(region).getByRole('button', { name: 'See all 24 reviews' }));
    await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(20));
    // Somebody posts a review while the first twenty are on screen: the
    // second page now starts one later, with the last of the first.
    reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: 'diner-late',
      displayName: 'Late Writer',
      rating: 5,
      text: 'Just now.',
      atUtc: NOW.toISOString(),
    });
    await userEvent.click(within(region).getByRole('button', { name: 'Show more reviews' }));
    await waitFor(() =>
      expect(within(region).queryByRole('button', { name: 'Show more reviews' })).toBeNull(),
    );
    await settle();

    const names = within(region)
      .getAllByRole('article')
      .map((card) => within(card).getByRole('heading').textContent);
    expect(names).toHaveLength(24);
    expect(new Set(names).size).toBe(names.length);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/u);
    errors.mockRestore();
  });

  it('says when the review was edited after the venue replied, and when the reply was written', async () => {
    const reviews = createMockReviewStore({ now: FRIDAY_EVENING });
    const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
    const first = reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: 'diner-1',
      displayName: 'Changed Mind',
      rating: 2,
      text: 'Cold coffee.',
      atUtc: day(5),
    });
    reviews.setReply({
      reviewId: first.reviewId,
      text: 'Sorry, we fixed the machine.',
      authorName: 'Aram Hakobyan',
      authorRole: 'owner',
      atUtc: day(3),
    });
    reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: 'diner-1',
      displayName: 'Changed Mind',
      rating: 4,
      text: 'Came back, much better.',
      atUtc: day(1),
    });
    render(createHarness({ now: FRIDAY_EVENING, reviews }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    const reply = region.querySelector<HTMLElement>('.pub-review-reply')!;
    expect(within(reply).getByText('3 days ago')).toBeDefined();
    expect(within(reply).getByText('The review was edited after this reply.')).toBeDefined();
  });

  it('starts an avatar with a whole character, one of two UTF-16 units included', async () => {
    // A Deseret letter: a letter, so the public-name rule keeps it, and outside
    // the BMP like an emoji, so `charAt(0)` would split it in half.
    const reviews = createMockReviewStore({ now: FRIDAY_EVENING });
    reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: 'diner-1',
      displayName: '\u{10414}\u{1043B}\u{1043F} Smile',
      rating: 5,
      text: null,
      atUtc: NOW.toISOString(),
    });
    render(createHarness({ now: FRIDAY_EVENING, reviews }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    const name = within(region).getByRole('heading', { level: 3 }).textContent ?? '';
    expect(Array.from(name)[0]).toBe('\u{10414}');
    expect(region.querySelector('.pub-review-avatar')?.textContent).toBe('\u{10414}');
  });

  it('keeps its loading line in a live region that is there before it speaks', async () => {
    render(createHarness({ now: FRIDAY_EVENING, showcase: true }).wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    const status = region.querySelector('[role="status"]');
    expect(status, 'mounted before anything loads').not.toBeNull();
    expect(status?.textContent).toBe('');
    await userEvent.click(within(region).getByRole('button', { name: 'See all 24 reviews' }));
    expect(region.querySelector('[role="status"]')).toBe(status);
  });

  it('offers no "see all" when the newest three are all there is', async () => {
    const reviews = createMockReviewStore({ now: FRIDAY_EVENING });
    reviews.save({
      branchId: 'b-lumen-north',
      dinerUserId: 'diner-1',
      displayName: 'Only Guest',
      rating: 4,
      text: 'Fine.',
      atUtc: new Date(NOW.getTime() - 86_400_000).toISOString(),
    });
    const harness = createHarness({ now: FRIDAY_EVENING, reviews });
    const pages = vi.spyOn(harness.gateway, 'getBranchReviews');
    render(harness.wrap(<PublicApp />, LUMEN));
    const region = await reviewsRegion();
    expect(within(region).getAllByRole('article')).toHaveLength(1);
    expect(within(region).queryByRole('button')).toBeNull();
    expect(pages).not.toHaveBeenCalled();
  });
});

describe('how old a review is', () => {
  const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  it.each([
    [0, 'today', 0],
    [1, 'days', 1],
    [6, 'days', 6],
    [7, 'weeks', 1],
    [29, 'weeks', 4],
    [31, 'months', 1],
    [364, 'months', 11],
    [400, 'years', 1],
  ] as const)('%i days is %s %i', (days, unit, count) => {
    expect(reviewAge(at(days), NOW)).toEqual({ unit, count });
  });

  it('never says a review is from the future', () => {
    expect(reviewAge(at(-2), NOW)).toEqual({ unit: 'today', count: 0 });
  });
});
