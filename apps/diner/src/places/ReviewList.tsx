import { Ionicons } from '@expo/vector-icons';
import { staleTime } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { myReviewKey } from '../data/dinerScope';
import { useSession } from '../stores/session';
import { colors, fontWeight, iconSize, radius, space, typography } from '../theme';
import type { Review } from './model';
import { ReportReviewSheet } from './ReportReviewSheet';

/** How long "Thanks. Your report was sent." stays on screen. */
const DONE_MS = 4000;

/** Read-only stars, announced as "4 of 5 stars" rather than read out as five glyphs. */
export function Stars({ rating, size = iconSize.sm }: { rating: number; size?: number }) {
  const { t } = useTranslation('diner');
  const whole = Math.round(rating);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('place.review.starLabel', { rating: whole })}
      style={styles.stars}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <Ionicons
          key={step}
          name={step <= whole ? 'star' : 'star-outline'}
          size={size}
          // The ink, not the bright orange: a lone glyph owes 3:1 on white.
          color={colors.warningInk}
        />
      ))}
    </View>
  );
}

export interface ReviewReporting {
  /** Whether this review gets a Report action: signed in, and not the diner's own. */
  readonly canReport: (review: Review) => boolean;
  readonly open: (reviewId: string) => void;
  /** The sheet and the confirmation. Render once, anywhere under the list. */
  readonly element: ReactNode;
}

/**
 * The Report action for a list of one place's reviews.
 *
 * Offered on every review the signed-in diner did not write. Somebody signed out
 * sees none: a report is sent under an account. The diner's own review is known
 * from `GET /api/diner/branches/{id}/review`, the same read the composer makes.
 */
export function useReviewReporting(placeId: string): ReviewReporting {
  const { t } = useTranslation('diner');
  const gateway = useGateway();
  const signedIn = useSession((state) => state.signedIn);
  const verified = useSession((state) => state.profile?.phoneVerified === true);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Only a verified account can have written a review, so only one is asked.
  const mine = useQuery({
    queryKey: myReviewKey(placeId),
    queryFn: () => gateway.getMyBranchReview(placeId),
    enabled: signedIn && verified,
    staleTime: staleTime.frequent,
  });
  const myReviewId = mine.data?.reviewId ?? null;

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  return {
    canReport: (review) => signedIn && review.id !== myReviewId,
    open: (reviewId) => {
      setDone(false);
      setReportingId(reviewId);
    },
    element: (
      <>
        <ReportReviewSheet
          reviewId={reportingId}
          onClose={() => setReportingId(null)}
          onReported={() => {
            setReportingId(null);
            setDone(true);
          }}
        />
        {done ? (
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Text style={styles.toastText} accessibilityRole="alert">
              {t('place.review.report.done')}
            </Text>
          </View>
        ) : null}
      </>
    ),
  };
}

export interface ReviewCardProps {
  readonly review: Review;
  readonly onReport?: (() => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

export function ReviewCard({ review, onReport, style }: ReviewCardProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlTag(locale), { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const parsed = new Date(review.date);
  const date = Number.isNaN(parsed.getTime()) ? review.date : dateFormat.format(parsed);
  return (
    <View style={[styles.review, style]}>
      <View style={styles.reviewHead}>
        <Text numberOfLines={1} style={styles.reviewAuthor}>
          {review.author}
        </Text>
        <Text style={styles.reviewDate}>{date}</Text>
      </View>
      <Stars rating={review.rating} />
      {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}
      {review.reply ? <ReplyView reply={review.reply} /> : null}
      {onReport ? (
        <Button
          label={t('place.review.report.action')}
          variant="text"
          size="small"
          fullWidth={false}
          icon="flag-outline"
          onPress={onReport}
          style={styles.report}
        />
      ) : null}
    </View>
  );
}

/**
 * The venue's answer under a review, signed as the venue signed it: "Reply
 * from Aram Hakobyan, Owner". Set apart by a rule on its leading edge, the
 * way a quoted answer reads, so it is never mistaken for the diner's words.
 */
export function ReplyView({ reply }: { readonly reply: NonNullable<Review['reply']> }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const format = useMemo(
    () => new Intl.DateTimeFormat(intlTag(locale), { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const parsed = new Date(reply.date);
  const date = Number.isNaN(parsed.getTime()) ? reply.date : format.format(parsed);
  const role = t(`place.review.reply.role.${reply.authorRole}`);
  // The server drops a name that looks like contact details: the role signs alone.
  const by = reply.authorName
    ? t('place.review.reply.signature', { name: reply.authorName, role })
    : t('place.review.reply.roleOnly', { role });
  return (
    <View style={styles.reply}>
      <Text style={styles.replyBy}>{t('place.review.reply.from', { by })}</Text>
      <Text style={styles.replyText}>{reply.text}</Text>
      <Text style={styles.reviewDate}>
        {reply.edited ? t('place.review.reply.editedOn', { date }) : date}
      </Text>
      {reply.reviewEditedAfter ? (
        <Text style={styles.reviewDate}>{t('place.review.reply.reviewEditedAfter')}</Text>
      ) : null}
    </View>
  );
}

export interface ReviewListProps {
  readonly placeId: string;
  readonly reviews: readonly Review[];
}

/** The newest few reviews on a place's page, each with Report where it applies. */
export function ReviewList({ placeId, reviews }: ReviewListProps) {
  const { t } = useTranslation('diner');
  const reporting = useReviewReporting(placeId);
  if (reviews.length === 0) {
    return <Text style={styles.noReviews}>{t('place.noReviews')}</Text>;
  }
  return (
    <View style={styles.reviews}>
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          onReport={reporting.canReport(review) ? () => reporting.open(review.id) : undefined}
        />
      ))}
      {reporting.element}
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 2 },
  reviews: { gap: space.md },
  review: {
    padding: space.md,
    gap: space.xs + 2,
    borderRadius: radius.card,
    backgroundColor: colors.background,
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  reviewAuthor: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.text,
    flexShrink: 1,
  },
  reviewDate: { ...typography.caption, color: colors.textMuted },
  reviewText: { ...typography.body, color: colors.text },
  reply: {
    gap: space.xs,
    marginTop: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  replyBy: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.text },
  replyText: { ...typography.body, color: colors.text },
  report: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  noReviews: { ...typography.body, color: colors.textMuted },
  toast: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastText: { ...typography.body, color: colors.successInk },
});
