import { Ionicons } from '@expo/vector-icons';
import { staleTime } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { placeKeys } from '../../places/hooks';
import { useSession } from '../../stores/session';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Button } from '../Button';
import { Text, TextInput } from '../Text';

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
 * One review per diner per place: a second save revises the first.
 */
export function ReviewComposer({ placeId, style }: ReviewComposerProps) {
  const { t } = useTranslation('diner');
  const signedIn = useSession((state) => state.signedIn);
  const profile = useSession((state) => state.profile);

  if (!signedIn || !profile) return null;
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

  const mine = useQuery({
    queryKey: ['places', 'myReview', placeId],
    queryFn: () => gateway.getMyBranchReview(placeId),
    staleTime: staleTime.frequent,
  });

  // A draft the diner has touched; until then the saved review shows through.
  const [draft, setDraft] = useState<{ rating: number; text: string } | null>(null);
  const rating = draft?.rating ?? mine.data?.rating ?? 0;
  const text = draft?.text ?? mine.data?.text ?? '';

  const save = useMutation({
    mutationFn: () => gateway.saveMyBranchReview({ branchId: placeId, rating, text }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['places', 'myReview', placeId], saved);
      setDraft(null);
      // The page's rating, count and newest reviews all moved.
      void queryClient.invalidateQueries({ queryKey: placeKeys.detail(placeId) });
      void queryClient.invalidateQueries({ queryKey: ['places', 'list'] });
    },
  });

  const failure = save.error
    ? save.error.name === 'PhoneNotVerifiedError'
      ? t('place.review.verifyHint')
      : t('place.review.failed')
    : null;

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>
        {mine.data ? t('place.review.yours') : t('place.review.title')}
      </Text>
      <View style={styles.stars} accessibilityRole="adjustable">
        {[1, 2, 3, 4, 5].map((step) => (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={t('place.review.starLabel', { rating: step })}
            accessibilityState={{ selected: step <= rating }}
            hitSlop={6}
            onPress={() => {
              save.reset();
              setDraft({ rating: step, text });
            }}
          >
            <Ionicons
              name={step <= rating ? actionIcon.star : 'star-outline'}
              size={iconSize.lg}
              color={colors.warning}
            />
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(value) => {
          save.reset();
          setDraft({ rating, text: value });
        }}
        placeholder={t('place.review.placeholder')}
        placeholderTextColor={colors.textSubtle}
        multiline
        maxLength={MAX_TEXT}
        accessibilityLabel={t('place.review.placeholder')}
      />
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      {save.isSuccess && !draft ? (
        <Text style={styles.saved}>{t('place.review.saved')}</Text>
      ) : null}
      <Button
        label={mine.data ? t('place.review.update') : t('place.review.submit')}
        disabled={rating < 1 || save.isPending || draft === null}
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
  stars: { flexDirection: 'row', gap: space.sm },
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
  error: { ...typography.caption, color: colors.error },
  saved: { ...typography.caption, color: colors.textMuted },
  submit: { marginTop: space.xs },
});
