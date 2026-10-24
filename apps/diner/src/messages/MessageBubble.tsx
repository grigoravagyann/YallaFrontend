import type { ConversationMessage } from '@yalla/api';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../components/Text';
import { colors, fontWeight, radius, space } from '../theme';

/** Whose side a bubble sits on. A message from an author this build does not know reads as the system's. */
export type BubbleSide = 'mine' | 'venue' | 'system';

export function bubbleSide(author: ConversationMessage['author']): BubbleSide {
  if (author === 'guest') return 'mine';
  if (author === 'venue') return 'venue';
  return 'system';
}

/**
 * One message, as the Thread board draws it (2026-10-23): the guest's on the
 * right in the cherry with ivory words, the venue's on the left in the
 * palest cherry tint — its "are you coming?" edged in the logo's burgundy —
 * and the system's line centred in green. Under a bubble its small line:
 * "18:31 · seen", or "Lava · 18:31".
 *
 * The words are never linkified: a link in a venue's message is text.
 */
export function MessageBubble({
  side,
  text,
  meta,
  ask = false,
  pending = false,
  accessibilityLabel,
  compact = false,
  style,
}: {
  readonly side: BubbleSide;
  readonly text: string;
  readonly meta?: string | null;
  /** The venue's "are you coming?": edged, so it reads as a question waiting. */
  readonly ask?: boolean;
  /** Sent from here, not yet answered by the server. */
  readonly pending?: boolean;
  readonly accessibilityLabel?: string;
  /** The booking card's preview: a little smaller. */
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  if (side === 'system') {
    return (
      <View
        style={[styles.systemWrap, style]}
        accessible
        accessibilityLabel={accessibilityLabel ?? text}
      >
        <Text style={styles.system}>{text}</Text>
      </View>
    );
  }
  const mine = side === 'mine';
  return (
    <View
      style={[styles.wrap, mine ? styles.wrapMine : styles.wrapVenue, style]}
      accessible
      accessibilityLabel={accessibilityLabel ?? [text, meta].filter(Boolean).join(', ')}
    >
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.venue,
          ask && styles.ask,
          pending && styles.pending,
        ]}
      >
        <Text style={[styles.text, compact && styles.textCompact, mine && styles.textMine]}>
          {text}
        </Text>
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, maxWidth: '84%' },
  wrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapVenue: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  mine: {
    backgroundColor: colors.brand,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: 4,
  },
  venue: {
    backgroundColor: colors.bubbleVenue,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderBottomRightRadius: radius.card,
    borderBottomLeftRadius: 4,
  },
  ask: { borderWidth: 1.5, borderColor: colors.logoInk },
  pending: { opacity: 0.72 },
  text: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  textCompact: { fontSize: 14, lineHeight: 20 },
  textMine: { color: colors.onPrimary },
  meta: { fontSize: 11.5, lineHeight: 15, color: colors.textMuted },
  systemWrap: { alignSelf: 'center', alignItems: 'center', maxWidth: '90%' },
  system: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: fontWeight.bold,
    color: colors.successInk,
    textAlign: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.chip,
    overflow: 'hidden',
    backgroundColor: colors.successSoft,
  },
});
