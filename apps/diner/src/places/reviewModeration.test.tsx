import { CannotReportOwnReviewError, ReviewNeedsVisitError, type MyBranchReview } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewComposer } from '../components/place/ReviewComposer';
import { useSession } from '../stores/session';
import type { Review } from './model';
import { ReportReviewSheet } from './ReportReviewSheet';
import { ReviewList } from './ReviewList';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * Reviews from the diner's side of moderation: reporting somebody else's
 * review, never one's own, and being told plainly when one's own was hidden or
 * cannot be posted without a visit.
 */

const gateway = vi.hoisted(() => ({
  reportReview: vi.fn(),
  getMyBranchReview: vi.fn(),
  saveMyBranchReview: vi.fn(),
  getDinerProfile: vi.fn(() => new Promise<never>(() => undefined)),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${Object.values(params).join(' ')}` : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('./repository', () => ({ placeRepository: {} }));

const PROFILE = {
  dinerUserId: 'diner-a',
  username: null,
  email: null,
  phoneE164: '+37491000123',
  phoneVerified: true,
  displayName: 'Anahit Sargsyan',
  localeCode: 'en',
  hasPassword: true,
  photo: null,
};

function mine(overrides: Partial<MyBranchReview> = {}): MyBranchReview {
  return {
    reviewId: 'mine',
    branchId: 'b1',
    rating: 4,
    text: 'Lovely terrace',
    createdAtUtc: '2026-09-01T10:00:00Z',
    updatedAtUtc: '2026-09-01T10:00:00Z',
    publicAuthorName: 'Anahit S.',
    hidden: false,
    ...overrides,
  } as MyBranchReview;
}

function withClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

const review = (id: string, author: string): Review => ({
  id,
  author,
  rating: 4,
  text: `${author} liked it`,
  date: '2026-09-01',
});

beforeEach(() => {
  for (const fn of Object.values(gateway)) fn.mockReset();
  gateway.getDinerProfile.mockImplementation(() => new Promise<never>(() => undefined));
});

afterEach(() => {
  cleanup();
  useSession.setState({ signedIn: false, profile: null });
});

describe('Report on a list of reviews', () => {
  it("is offered on somebody else's review and not on the diner's own", async () => {
    useSession.setState({ signedIn: true, profile: PROFILE as never });
    gateway.getMyBranchReview.mockResolvedValue(mine());

    withClient(
      <ReviewList
        placeId="b1"
        reviews={[review('mine', 'Anahit S.'), review('r2', 'Tigran M.')]}
      />,
    );

    await waitFor(() => expect(gateway.getMyBranchReview).toHaveBeenCalledWith('b1'));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'place.review.report.action' })).toHaveLength(1),
    );
  });

  it('is not offered to somebody signed out: a report is sent under an account', () => {
    withClient(<ReviewList placeId="b1" reviews={[review('r2', 'Tigran M.')]} />);

    expect(screen.queryByRole('button', { name: 'place.review.report.action' })).toBeNull();
    expect(gateway.getMyBranchReview).not.toHaveBeenCalled();
  });
});

describe('ReportReviewSheet', () => {
  it('sends one of the five reasons with the optional note', async () => {
    gateway.reportReview.mockResolvedValue(undefined);
    const onReported = vi.fn();

    withClient(<ReportReviewSheet reviewId="r2" onClose={vi.fn()} onReported={onReported} />);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'place.review.report.send' }));
    expect(gateway.reportReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'place.review.report.reason.personalInfo' }));
    fireEvent.change(screen.getByLabelText('place.review.report.note'), {
      target: { value: '  Posts my phone number  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'place.review.report.send' }));

    await waitFor(() => expect(onReported).toHaveBeenCalledTimes(1));
    expect(gateway.reportReview).toHaveBeenCalledWith({
      reviewId: 'r2',
      reason: 'personal-info',
      note: 'Posts my phone number',
    });
  });

  it("says a diner's own review cannot be reported", async () => {
    gateway.reportReview.mockRejectedValue(
      Object.create(CannotReportOwnReviewError.prototype) as CannotReportOwnReviewError,
    );
    const onReported = vi.fn();

    withClient(<ReportReviewSheet reviewId="mine" onClose={vi.fn()} onReported={onReported} />);
    fireEvent.click(screen.getByRole('radio', { name: 'place.review.report.reason.spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'place.review.report.send' }));

    expect(await screen.findByText('place.review.report.own')).toBeTruthy();
    expect(onReported).not.toHaveBeenCalled();
  });
});

describe('ReviewComposer', () => {
  beforeEach(() => {
    useSession.setState({ signedIn: true, profile: PROFILE as never });
  });

  it("says the diner's own review is hidden, and under which public name it was posted", async () => {
    gateway.getMyBranchReview.mockResolvedValue(mine({ hidden: true }));

    withClient(<ReviewComposer placeId="b1" />);

    expect(await screen.findByText('place.review.hidden')).toBeTruthy();
    expect(screen.getByText('place.review.postedAs Anahit S.')).toBeTruthy();
  });

  it('offers five labelled star buttons and explains a refusal for want of a visit', async () => {
    gateway.getMyBranchReview.mockResolvedValue(null);
    gateway.saveMyBranchReview.mockRejectedValue(
      Object.create(ReviewNeedsVisitError.prototype) as ReviewNeedsVisitError,
    );

    withClient(<ReviewComposer placeId="b1" />);

    const stars = await screen.findAllByRole('button', { name: /^place\.review\.starLabel \d$/u });
    expect(stars).toHaveLength(5);
    expect(document.querySelector('[role="adjustable"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'place.review.starLabel 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'place.review.submit' }));

    expect(await screen.findByText('place.review.needsVisit')).toBeTruthy();
    expect(gateway.saveMyBranchReview).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b1', rating: 5 }),
    );
  });
});
