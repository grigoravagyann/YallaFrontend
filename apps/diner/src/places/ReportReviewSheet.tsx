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
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { SheetModal } from '../components/motion/SheetModal';
import { Text, TextInput } from '../components/Text';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { colors, radius, space, typography } from '../theme';

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

/** The share of the screen the sheet may take before its form scrolls. */
const MAX_HEIGHT = 0.9;

/**
 * "Report this review": one of five reasons and an optional note, sent to the
 * platform's moderators with `POST /api/diner/reviews/{reviewId}/report`.
 *
 * Reporting twice is accepted and changes nothing, so a double tap is not an
 * error. A diner's own review cannot be reported and says so.
 */
export function ReportReviewSheet({ reviewId, onClose, onReported }: ReportReviewSheetProps) {
  const visible = reviewId !== null;
  // The review on screen outlives `reviewId` going null, so the sheet slides
  // away with its form still drawn. Every opening starts an empty form, keyed
  // by the opening — another review, or the same one again.
  const [shown, setShown] = useState({ visible, reviewId, count: 0 });
  if (shown.visible !== visible || (reviewId !== null && reviewId !== shown.reviewId)) {
    setShown({
      visible,
      reviewId: reviewId ?? shown.reviewId,
      count: visible ? shown.count + 1 : shown.count,
    });
  }
  if (shown.reviewId === null) return null;
  return (
    <ReportForm
      key={shown.count}
      visible={visible}
      reviewId={shown.reviewId}
      onClose={onClose}
      onReported={onReported}
    />
  );
}

function ReportForm({
  visible,
  reviewId,
  onClose,
  onReported,
}: {
  readonly visible: boolean;
  readonly reviewId: string;
  readonly onClose: () => void;
  readonly onReported: () => void;
}) {
  const { t } = useTranslation(['diner', 'common']);
  const gateway = useGateway();
  const keyboard = useKeyboardInset();
  const { height } = useWindowDimensions();
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
    <SheetModal
      visible={visible}
      {...(busy ? {} : { onRequestClose: onClose })}
      closeLabel={t('action.close', { ns: 'common' })}
      accessibilityLabel={t('place.review.report.title')}
      // On iOS the keyboard would otherwise cover the note and Send report.
      style={{ bottom: keyboard, maxHeight: height * MAX_HEIGHT - keyboard }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text display style={styles.title} accessibilityRole="header">
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
            size="large"
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
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  title: { ...typography.h3, fontSize: 19, color: colors.text },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: 80,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  error: { ...typography.body, color: colors.errorInk },
  actions: { gap: space.sm },
});
