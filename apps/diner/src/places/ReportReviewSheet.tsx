import {
  CannotReportOwnReviewError,
  MAX_MODERATION_TEXT,
  REVIEW_REPORT_REASONS,
  type ReviewReportReason,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Text, TextInput } from '../components/Text';
import { colors, radius, shadows, space, typography } from '../theme';

/** The copy for each reason, in the order the server lists them. */
const REASON_LABEL: Readonly<Record<ReviewReportReason, string>> = {
  spam: 'place.review.report.reason.spam',
  offensive: 'place.review.report.reason.offensive',
  'not-a-visit': 'place.review.report.reason.notAVisit',
  'personal-info': 'place.review.report.reason.personalInfo',
  other: 'place.review.report.reason.other',
};

export interface ReportReviewSheetProps {
  /** The review being reported; `null` keeps the sheet closed. */
  readonly reviewId: string | null;
  readonly onClose: () => void;
  /** The server took the report (or already had it from this diner). */
  readonly onReported: () => void;
}

/**
 * "Report this review": one of five reasons and an optional note, sent to the
 * platform's moderators with `POST /api/diner/reviews/{reviewId}/report`.
 *
 * Reporting twice is accepted and changes nothing, so a double tap is not an
 * error. A diner's own review cannot be reported and says so.
 */
export function ReportReviewSheet({ reviewId, onClose, onReported }: ReportReviewSheetProps) {
  return (
    <Modal visible={reviewId !== null} transparent animationType="fade" onRequestClose={onClose}>
      {reviewId ? (
        // Keyed by the review, so a sheet opened on another review starts empty.
        <ReportForm key={reviewId} reviewId={reviewId} onClose={onClose} onReported={onReported} />
      ) : null}
    </Modal>
  );
}

function ReportForm({
  reviewId,
  onClose,
  onReported,
}: {
  readonly reviewId: string;
  readonly onClose: () => void;
  readonly onReported: () => void;
}) {
  const { t } = useTranslation(['diner', 'common']);
  const gateway = useGateway();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReviewReportReason | null>(null);
  const [note, setNote] = useState('');

  const report = useMutation({
    mutationFn: (chosen: ReviewReportReason) =>
      gateway.reportReview({ reviewId, reason: chosen, note: note.trim() || null }),
    onSuccess: onReported,
  });
  const busy = report.isPending;

  const failure = report.error
    ? report.error instanceof CannotReportOwnReviewError
      ? t('place.review.report.own')
      : t('place.review.report.failed')
    : null;

  return (
    // On iOS the keyboard would otherwise cover the note and Send report.
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityLabel={t('action.cancel', { ns: 'common' })}
        onPress={busy ? undefined : onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.grabber} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {t('place.review.report.title')}
          </Text>
          <View style={styles.reasons} accessibilityRole="radiogroup">
            {REVIEW_REPORT_REASONS.map((value) => (
              <Chip
                key={value}
                label={t(REASON_LABEL[value])}
                shape="rounded"
                accessibilityRole="radio"
                selected={reason === value}
                disabled={busy}
                onPress={() => {
                  report.reset();
                  setReason(value);
                }}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={(value) => {
              report.reset();
              setNote(value);
            }}
            placeholder={t('place.review.report.note')}
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t('place.review.report.note')}
            multiline
            maxLength={MAX_MODERATION_TEXT}
            editable={!busy}
          />
          {failure ? (
            <Text style={styles.error} accessibilityRole="alert">
              {failure}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={t('place.review.report.send')}
              disabled={reason === null || busy}
              busy={busy}
              onPress={() => {
                if (reason) report.mutate(reason);
              }}
            />
            <Button
              label={t('action.cancel', { ns: 'common' })}
              variant="text"
              disabled={busy}
              onPress={onClose}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlayDark },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    ...shadows.float,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  body: { gap: space.md },
  title: { ...typography.h3, color: colors.text },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
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
  error: { ...typography.body, color: colors.errorInk },
  actions: { gap: space.sm },
});
