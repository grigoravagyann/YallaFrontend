import type { MenuItemDetail } from '@yalla/api';
import { listsNoAllergens } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';

/** A photo this phone can load: the gateway resolves the server's relative paths. */
function loadablePhoto(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export interface MenuItemRowProps {
  readonly item: MenuItemDetail;
  /** How many of this dish are in the basket — the tab's tray, or the takeaway cart. */
  readonly quantity: number;
  readonly locale: Parameters<typeof formatDram>[1];
  readonly expanded: boolean;
  /** False for anyone who cannot add now. The menu stays readable. */
  readonly canAdd: boolean;
  /** The basket is waiting on an unclear send: nothing changes until it is checked. */
  readonly frozen: boolean;
  /**
   * The dish is on the menu but not offered here — "Only in the hall · not
   * for takeaway" on the takeaway menu. Greyed out, said in its place, and
   * never offered a +.
   */
  readonly notOffered?: string | undefined;
  readonly onToggle: () => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}

/**
 * One dish: name, what it is, and the price, with a + on the right that turns
 * into a − n + stepper once it is in the basket. The table's menu and the
 * takeaway menu both draw their dishes with it.
 *
 * The descriptive fields are on the row, not behind a modal: the backend made
 * ingredients, allergens, portion size and spice level required precisely so a
 * diner stops needing to ask a waiter. The row shows a summary always and the
 * full detail on tap, which keeps a forty-item menu scannable without hiding
 * anything.
 */
export function MenuItemRow({
  item,
  quantity,
  locale,
  expanded,
  canAdd,
  frozen,
  notOffered,
  onToggle,
  onAdd,
  onRemove,
}: MenuItemRowProps) {
  const { t } = useTranslation('diner');
  // The small variant: a row draws it at 56pt.
  const photo = loadablePhoto(item.photo.thumbnailUrl) ?? loadablePhoto(item.photo.cardUrl);
  const meta = [
    item.portionSize,
    t('menu.prep', { count: item.prepMinutes }),
    item.spiceLevel === 'notSpicy' ? null : t(`menu.spice.${item.spiceLevel}`),
  ]
    .filter(Boolean)
    .join(' · ');
  const muted = !item.isAvailable || Boolean(notOffered);

  return (
    <View
      style={[
        styles.item,
        quantity > 0 && styles.itemOn,
        !item.isAvailable && styles.itemOut,
        notOffered ? styles.itemNotOffered : null,
      ]}
    >
      {photo ? <PhotoImage source={photo} style={styles.thumb} /> : null}
      <Pressable
        accessibilityRole="button"
        // Named outright: a pressable named only by its text had no name in
        // the web build's accessibility tree.
        accessibilityLabel={[item.name, formatDram(item.priceDram, locale), notOffered]
          .filter(Boolean)
          .join(', ')}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.itemText}
      >
        <Text style={[styles.itemName, muted && styles.mutedText]}>{item.name}</Text>
        {notOffered ? (
          <Text style={styles.itemDesc}>{notOffered}</Text>
        ) : item.description ? (
          <Text style={styles.itemDesc} numberOfLines={expanded ? undefined : 2}>
            {item.description}
          </Text>
        ) : null}
        {notOffered ? null : <Text style={styles.itemMeta}>{meta}</Text>}
        <Text style={[styles.itemPrice, notOffered ? styles.mutedPrice : null]}>
          {formatDram(item.priceDram, locale)}
        </Text>

        {expanded ? (
          <View style={styles.detail}>
            {item.ingredients ? (
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>{t('menu.ingredients')}: </Text>
                {item.ingredients}
              </Text>
            ) : null}
            {/* "none" is the venue's answer "no allergens", said in the reader's language. */}
            {item.allergens && !listsNoAllergens(item.allergens) ? (
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>{t('menu.allergens')}: </Text>
                {item.allergens}
              </Text>
            ) : (
              <Text style={styles.detailLine}>{t('menu.noAllergens')}</Text>
            )}
          </View>
        ) : null}
      </Pressable>

      {/* Shown and marked, never hidden. A dish that silently vanishes reads as
          a broken menu and the diner asks a waiter — the exact question this
          screen exists to remove. */}
      {!item.isAvailable ? (
        <View style={styles.outBadge}>
          <Text style={styles.outText}>{t('menu.unavailable')}</Text>
        </View>
      ) : notOffered || !canAdd ? null : quantity === 0 ? (
        <RoundPress
          icon="add"
          accessibilityLabel={t('menu.addItem', { name: item.name })}
          disabled={frozen}
          onPress={onAdd}
          style={styles.addButton}
        />
      ) : (
        <View
          role="group"
          accessibilityLabel={t('menu.quantity', { name: item.name })}
          style={[styles.stepper, frozen && styles.frozen]}
        >
          <RoundPress
            icon="remove"
            accessibilityLabel={t('tray.fewer')}
            disabled={frozen}
            onPress={onRemove}
          />
          <Text accessibilityLiveRegion="polite" style={styles.quantity}>
            {quantity}
          </Text>
          <RoundPress
            icon="add"
            accessibilityLabel={t('tray.more')}
            disabled={frozen}
            onPress={onAdd}
          />
        </View>
      )}
    </View>
  );
}

/** A 44pt round press with a glyph — the + on a dish, and each end of its stepper. */
function RoundPress({
  icon,
  accessibilityLabel,
  disabled,
  onPress,
  style,
}: {
  readonly icon: 'add' | 'remove';
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.round}
      >
        <Ionicons name={icon} size={iconSize.md} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

const THUMB = 56;

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingLeft: space.md,
    paddingRight: space.sm + 2,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // A dish in the basket stays white; its stepper says it is in.
  itemOn: { borderColor: colors.borderStrong },
  itemOut: { opacity: 0.7 },
  // Not offered here: the hairline only, the words and the price muted.
  itemNotOffered: { borderColor: colors.border },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  mutedText: { color: colors.textMuted },
  itemDesc: { ...typography.caption, color: colors.textMuted },
  itemMeta: { ...typography.caption, color: colors.textMuted },
  itemPrice: {
    marginTop: 2,
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    ...tabularNumbers,
  },
  mutedPrice: { color: colors.textMuted, fontWeight: fontWeight.regular },
  detail: { gap: space.xs, paddingTop: space.xs },
  detailLine: { ...typography.caption, color: colors.text },
  detailLabel: { fontWeight: fontWeight.bold },

  round: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    ...shadows.brand,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    ...shadows.brand,
  },
  frozen: { opacity: 0.5 },
  quantity: {
    minWidth: 20,
    textAlign: 'center',
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
    ...tabularNumbers,
  },
  outBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outText: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.textMuted },
});
