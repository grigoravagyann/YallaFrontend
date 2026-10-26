import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SlidingChoice, type SlidingOption } from '../components/motion/SlidingChoice';
import { ChoiceGrid, type ChoiceGridOption } from '../components/place/ChoiceGrid';
import { colors, layout, radius, space } from '../theme';
import { MORE, PARTY_MORE_FROM, PARTY_SIZES, SLOT_GAP } from './formRules';

/** The party pill: four 44pt choices with 4 between them. */
const PARTY_CELL = layout.touchTarget;
const PARTY_GAP = space.xs;
const PARTY_PILL_WIDTH = PARTY_CELL * 4 + PARTY_GAP * 3;

export interface PartyPickerProps {
  readonly partySize: number;
  /** Whether the larger sizes are open under the row. */
  readonly moreOpen: boolean;
  /** The larger sizes the chosen table seats. */
  readonly moreSizes: readonly number[];
  /** Whether the chosen table seats a party of `size`. */
  readonly fits: (size: number) => boolean;
  readonly onMoreOpenChange: (open: boolean) => void;
  readonly onSelectParty: (size: number) => void;
}

/** Guests: one glass row, the label and the sizes as radios. */
export function PartyPicker({
  partySize,
  moreOpen,
  moreSizes,
  fits,
  onMoreOpenChange,
  onSelectParty,
}: PartyPickerProps) {
  const { t } = useTranslation('diner');
  const moreAllowed = moreSizes.length > 0;

  // A table for four to six is not a table for two, any more than a table
  // for two is a table for six: sizes the chosen table cannot seat are struck.
  const partyOptions: readonly SlidingOption<string>[] = [
    ...PARTY_SIZES.map((size) => ({
      value: String(size),
      label: String(size),
      disabled: !fits(size),
    })),
    {
      value: MORE,
      label: t('book.partySizeMore', { count: PARTY_MORE_FROM }),
      disabled: !moreAllowed,
    },
  ];
  const moreOptions: readonly ChoiceGridOption[] = moreSizes.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <View style={styles.partyCard}>
      <View style={styles.partyRow}>
        <Text numberOfLines={1} style={styles.partyLabel}>
          {t('book.partySize')}
        </Text>
        <SlidingChoice
          options={partyOptions}
          value={moreOpen ? MORE : String(partySize)}
          onChange={(value) => {
            if (value === MORE) {
              onMoreOpenChange(true);
              if (partySize < PARTY_MORE_FROM) {
                onSelectParty(moreSizes[0] ?? PARTY_MORE_FROM);
              }
              return;
            }
            onMoreOpenChange(false);
            onSelectParty(Number(value));
          }}
          columns={partyOptions.length}
          gap={PARTY_GAP}
          accessibilityLabel={t('book.partySize')}
          style={styles.partyChoice}
        />
      </View>
      {moreOpen && moreSizes.length > 0 ? (
        <ChoiceGrid
          options={moreOptions}
          value={String(partySize)}
          onChange={(value) => onSelectParty(Number(value))}
          columns={4}
          gap={SLOT_GAP}
          accessibilityLabel={t('book.partySize')}
          style={styles.moreChoice}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  partyCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: space.md + 2,
    paddingRight: space.xs + 2,
    paddingVertical: space.xs + 2,
    gap: space.sm,
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  partyLabel: { flex: 1, fontSize: 13.5, lineHeight: 18, color: colors.text },
  partyChoice: { width: PARTY_PILL_WIDTH },
  moreChoice: { marginRight: space.sm, marginBottom: space.xs },
});
