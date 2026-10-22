import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { colors, displayWeight, space } from '../../theme';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { SheetModal } from '../motion/SheetModal';
import { Text } from '../Text';

/** The filters the list applies itself: the server knows nothing of "now" or "here". */
export const QUICK_FILTERS = ['openNow', 'nearby'] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number];
export type QuickFilters = Readonly<Record<QuickFilter, boolean>>;
export const NO_QUICK_FILTERS: QuickFilters = { openNow: false, nearby: false };

/** Read as literals, so the i18n check sees every key the sheet renders. */
const QUICK_LABEL_KEY: Readonly<Record<QuickFilter, string>> = {
  openNow: 'explore.quick.openNow',
  nearby: 'explore.quick.nearby',
};

export interface ExploreFilterSheetProps {
  readonly visible: boolean;
  readonly value: QuickFilters;
  readonly onChange: (value: QuickFilters) => void;
  readonly onClose: () => void;
}

/**
 * Behind the filter button in the search field: Open now and Nearby, each a
 * toggle, applied as they are tapped. The category chips stay on the screen;
 * these two used to sit beside them and now live here.
 */
export function ExploreFilterSheet({ visible, value, onChange, onClose }: ExploreFilterSheetProps) {
  const { t } = useTranslation('diner');
  const any = QUICK_FILTERS.some((key) => value[key]);
  return (
    <SheetModal
      visible={visible}
      onRequestClose={onClose}
      closeLabel={t('action.close', { ns: 'common' })}
      accessibilityLabel={t('explore.filterSheet.title')}
    >
      <Text display accessibilityRole="header" style={styles.title}>
        {t('explore.filterSheet.title')}
      </Text>
      <View style={styles.chips}>
        {QUICK_FILTERS.map((key) => (
          <Chip
            key={key}
            label={t(QUICK_LABEL_KEY[key])}
            selected={value[key]}
            // On or off on its own, and said so on the web too.
            accessibilityRole="switch"
            onPress={() => onChange({ ...value, [key]: !value[key] })}
          />
        ))}
      </View>
      <View style={styles.actions}>
        {any ? (
          <Button
            label={t('explore.clearFilters')}
            variant="secondary"
            onPress={() => onChange(NO_QUICK_FILTERS)}
            style={styles.action}
          />
        ) : null}
        <Button label={t('explore.filterSheet.done')} onPress={onClose} style={styles.action} />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});
