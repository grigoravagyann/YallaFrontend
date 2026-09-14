import { Ionicons } from '@expo/vector-icons';
import {
  PhoneNotVerifiedError,
  ReviewNeedsVisitError,
  publicAuthorName,
  staleTime,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDinerProfile } from '../../data/accountQueries';
import { myReviewKey } from '../../data/dinerScope';
import { placeKeys } from '../../places/hooks';
import { useSession } from '../../stores/session';
import { colors, fontWeight, iconSize, layout, radius, space, typography } from '../../theme';
import { Button } from '../Button';
import { Text, TextInput } from '../Text';
import { reviewForm, type ReviewDraft } from './reviewDraft';

/** The server's cap on review text. */
const MAX_TEXT = 1000;

export interface ReviewComposerProps {
  /** The branch id — the place's own id. */
  readonly placeId: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Write or revise this diner's review of one place.
 *
 * Offered only to a signed-in diner whose phone is verified, because the
 * server refuses anybody else; an unverified account sees one line saying why
 * rather than a form that fails on submit. Nobody signed in sees nothing — a
 * review is not a reason to push a stranger into sign-up from a details page.
 *
 * One review per diner per place: a second save revises the first. A first
 * review needs a visit in the last 180 days (K8), and the refusal says exactly
 * that. The review is public under the name shown above the stars.
 */
export function ReviewComposer({ placeId, style }: ReviewComposerProps) {
  const { t } = useTranslation('diner');
  const signedIn = useSession((state) => state.signedIn);
  const profile = useSession((state) => state.profile);
  // Read here too, not only on the Profile tab: a session restored at launch
  // has no profile until something asks, and without it this form never shows.
  const profileQuery = useDinerProfile();

  if (!signedIn) return null;
  if (!profile) {
    // An account that cannot be read is not one to offer a form to.
    if (profileQuery.isError) return null;
    return (
      <View style={style}>
        <Text style={styles.hint}>{t('net.loading')}</Text>
      </View>
    );
  }
  if (!profile.phoneVerified) {
    return (
      <View style={style}>
        <Text style={styles.hint}>{t('place.review.verifyHint')}</Text>
      </View>
    );
  }
  return <VerifiedComposer placeId={placeId} {...(style ? { style } : {})} />;
}

function VerifiedComposer({ placeId, style }: ReviewComposerProps) {
  const { t } = useTranslation('diner');
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const displayName = useSession((state) => state.profile?.displayName ?? null);

  const mine = useQuery({
    queryKey: myReviewKey(placeId),
    queryFn: () => gateway.getMyBranchReview(placeId),
    staleTime: staleTime.frequent,
  });

  // What the diner has touched; every other field shows the saved review.
  const [draft, setDraft] = useState<ReviewDraft>({});
  const { rating, text, touched } = reviewForm(draft, mine.data ?? null);

  const save = useMutation({
    mutationFn: () => gateway.saveMyBranchReview({ branchId: placeId, rating, text }),
    onSuccess: (saved) => {
      queryClient.setQueryData(myReviewKey(placeId), saved);
      setDraft({});
      // The page's rating, count and newest reviews all moved, and so did the full list.
      void queryClient.invalidateQueries({ queryKey: placeKeys.detail(placeId) });
      void queryClient.invalidateQueries({ queryKey: placeKeys.reviews(placeId) });
      void queryClient.invalidateQueries({ queryKey: ['places', 'list'] });
    },
  });

  // Nothing is editable until the saved review is known. The save replaces the
  // rating and text together, so a form filled in over a review that has not
  // arrived — or failed to — would post over what the diner wrote.
  if (mine.isPending) {
    return (
      <View style={[styles.card, style]}>
        <Text style={styles.hint}>{t('net.loading')}</Text>
      </View>
    );
  }
  if (mine.isError) {
    return (
      <View style={[styles.card, style]}>
        <Text style={styles.error}>{t('place.review.loadFailed')}</Text>
        <Button
          label={t('net.retry')}
          variant="text"
          fullWidth={false}
          onPress={() => void mine.refetch()}
        />
      </View>
    );
  }

  const failure = save.error
    ? save.error instanceof ReviewNeedsVisitError
      ? t('place.review.needsVisit')
      : save.error instanceof PhoneNotVerifiedError
        ? t('place.review.verifyHint')
        : t('place.review.failed')
    : null;

  // The server's own answer once there is a review; the same rule applied to
  // the account's name before the first one, so the diner knows before posting.
  const postedAs = mine.data?.publicAuthorName ?? publicAuthorName(displayName);

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>
        {mine.data ? t('place.review.yours') : t('place.review.title')}
      </Text>
      <Text style={styles.hint}>{t('place.review.postedAs', { name: postedAs })}</Text>
      {mine.data?.hidden ? (
        <Text style={styles.hidden} accessibilityRole="alert">
          {t('place.review.hidden')}
        </Text>
      ) : null}
      {/* Five buttons, each a full touch target and each saying what it sets. */}
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((step) => (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={t('place.review.starLabel', { rating: step })}
            accessibilityState={{ selected: step === rating }}
            onPress={() => {
              save.reset();
              setDraft((current) => ({ ...current, rating: step }));
            }}
            style={({ pressed }) => [styles.star, pressed && styles.starPressed]}
          >
            <Ionicons
              name={step <= rating ? 'star' : 'star-outline'}
              size={iconSize.lg}
              color={colors.warningInk}
            />
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(value) => {
          save.reset();
          setDraft((current) => ({ ...current, text: value }));
        }}
        placeholder={t('place.review.placeholder')}
        placeholderTextColor={colors.textSubtle}
        multiline
        maxLength={MAX_TEXT}
        accessibilityLabel={t('place.review.placeholder')}
      />
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {failure}
        </Text>
      ) : null}
      {save.isSuccess && !touched ? (
        <Text style={styles.saved}>{t('place.review.saved')}</Text>
      ) : null}
      <Button
        label={mine.data ? t('place.review.update') : t('place.review.submit')}
        disabled={rating < 1 || save.isPending || !touched}
        onPress={() => save.mutate()}
        style={styles.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  stars: { flexDirection: 'row', gap: space.xs },
  star: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  starPressed: { backgroundColor: colors.surfaceMuted },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: 80,
    padding: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  hint: { ...typography.caption, color: colors.textMuted },
  hidden: { ...typography.body, color: colors.warningInk },
  error: { ...typography.caption, color: colors.errorInk },
  saved: { ...typography.caption, color: colors.textMuted },
  submit: { marginTop: space.xs },
});
