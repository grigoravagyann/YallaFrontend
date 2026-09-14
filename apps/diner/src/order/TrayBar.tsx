import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { useNow } from '../hooks/useNow';
import { colors, fontWeight, radius, space, tabularNumbers, typography } from '../theme';
import { trayBarState } from './tray';
import { useTray } from './TrayProvider';

/**
 * The bar at the bottom of the menu.
 *
 * **This bar's only job is that it cannot be read as "sent".**
 *
 * It used to be a single filled pill: a count, a total, and the word *Review*.
 * Every part of that reads like an order that exists. "Review" describes looking
 * at something already done; a total beside it looks like a bill; and the only
 * other filled pill on this flow is the one that confirms things. A diner who
 * reads it that way puts the phone down and waits twenty minutes for food nobody
 * is cooking — the worst failure in the app, and the one Prompt 9 flagged and
 * could not test.
 *
 * Three rules, all of them about the same thing:
 *
 * 1. **The action says what it does.** "Send to kitchen", not "Review".
 * 2. **The bar states the negative.** While anything is in the tray it says, in
 *    words rather than by implication, that nothing has been sent. A state a
 *    person has to infer is a state half of them infer wrongly.
 * 3. **The confirmed state is a different object.** Different colour, different
 *    shape, no count, no subtotal, and the server's own estimate on it. Nothing
 *    about it can be produced by rendering the tray differently, which is what
 *    stops the two from converging the next time somebody edits this file.
 *
 * The same honesty rule the staff app's queue follows: never present a state the
 * server does not agree with. `lastSent` is set only from a `PlaceOrderResult`.
 */

export interface TrayBarProps {
  readonly tabId: string;
  /** Opens the tray for review before sending. */
  readonly onReview: () => void;
  /** Dismisses the confirmed state and goes to the bill. */
  readonly onSeeBill: () => void;
  /** The branch's zone. Never the device's — see `RenderedTab.timeZoneId`. */
  readonly timeZoneId: string;
}

export function TrayBar({ onReview, onSeeBill, timeZoneId }: TrayBarProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { state, dispatch } = useTray();

  // Subscribed rather than read at render, so "sitting in your tray" actually
  // appears while somebody is staring at the menu and not touching anything.
  const now = useNow(30_000);
  const bar = trayBarState(state, now.getTime());

  if (bar.kind === 'empty') return null;

  if (bar.kind === 'sent') {
    return (
      <View style={styles.sentBar} accessibilityRole="summary">
        <View style={styles.sentText}>
          <Text style={styles.sentTitle}>{t('tray.bar.sentTitle')}</Text>
          {/*
            The kitchen's own estimate, stated once. Not a progress bar that
            creeps for twenty minutes and is wrong at the end of it, and not a
            countdown computed here: `estimatedReadyAtUtc` is the longest prep
            time on the order, from the server.
          */}
          <Text style={styles.sentBody}>
            {bar.estimatedReadyAtUtc
              ? t('tray.bar.sentReady', {
                  time: formatTime(bar.estimatedReadyAtUtc, timeZoneId, locale),
                })
              : t('tray.bar.sentNoEstimate')}
          </Text>
        </View>
        <Button
          label={t('tray.bar.seeBill')}
          variant="secondary"
          fullWidth={false}
          onPress={() => {
            dispatch({ type: 'dismissSent' });
            onSeeBill();
          }}
          style={styles.action}
        />
      </View>
    );
  }

  return (
    <View style={styles.holdingBar}>
      <View style={styles.holdingText}>
        <Text style={styles.holdingCount}>
          {t('tray.bar.count', { count: bar.count })} · {formatDram(bar.subtotalDram, locale)}
        </Text>
        {/*
          The negative, in words. This is the sentence the whole component
          exists for, and it is deliberately not a subtitle in a lighter grey:
          it is the same size as the count beside it.
        */}
        <Text style={styles.holdingNotSent}>
          {bar.nudge ? t('tray.bar.stillNotSent') : t('tray.bar.notSent')}
        </Text>
      </View>

      <Button
        label={t('tray.bar.send')}
        accessibilityLabel={t('tray.bar.send')}
        onPress={onReview}
        fullWidth={false}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The tray: a dashed outline on white, not a filled bar. The green fill is
  // reserved for the confirmed state below, so the two never read as the same object.
  holdingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  holdingText: { flex: 1, gap: 2 },
  holdingCount: {
    ...typography.bodyLg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    ...tabularNumbers,
  },
  holdingNotSent: {
    ...typography.bodyLg,
    // Ink, not orange. Orange on white does not clear AA at body size, and
    // this is the one sentence on the bar that must be read.
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  action: { paddingHorizontal: space.lg },

  // The confirmation: a green tint with a green edge, no count and no money on it.
  sentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
  },
  sentText: { flex: 1, gap: 2 },
  sentTitle: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  sentBody: { ...typography.body, color: colors.text },
});
