import { Ionicons } from '@expo/vector-icons';
import type { TableAvailability } from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Rise } from '../components/motion/Rise';
import { RoomPhotosView } from '../components/tables/RoomPhotosView';
import { TableLegend } from '../components/tables/TableLegend';
import { useCapacityLabel } from '../components/tables/TableMarker';
import type { PlaceRoom } from '../places/model';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../theme';
import type { ChosenTable } from './formRules';
import { bookingStyles } from './bookingStyles';

/** The table went to someone else between the photo and the tap: said where the next pick is made. */
export function ConflictNote({ text }: { readonly text: string | null }) {
  if (!text) return null;
  return (
    <Rise>
      <View accessibilityRole="alert" style={styles.conflict}>
        <Ionicons name={actionIcon.error} size={iconSize.md - 2} color={colors.errorInk} />
        <Text style={styles.conflictText}>{text}</Text>
      </View>
    </Rise>
  );
}

export interface TablePhotosProps {
  /** The rooms as they will be at the slot; none drawn while there are none. */
  readonly rooms: readonly PlaceRoom[];
  readonly selectedTableId: string | null;
  readonly partySize: number;
  /** Whether a question-mark pin is on the photos, for the legend. */
  readonly anyRequest: boolean;
  readonly conflictText: string | null;
  /** Where "Pick a table" starts in the scroll. */
  readonly onTop: (y: number) => void;
  readonly onSelect: (tableId: string | null) => void;
}

/** "Pick a table": the room photos at the slot, or — with none to draw — the conflict alone. */
export function TablePhotos({
  rooms,
  selectedTableId,
  partySize,
  anyRequest,
  conflictText,
  onTop,
  onSelect,
}: TablePhotosProps) {
  const { t } = useTranslation('diner');
  if (rooms.length === 0) {
    // No photo to draw it over: the conflict still has to be said.
    return <ConflictNote text={conflictText} />;
  }
  return (
    <View
      onLayout={(event) => {
        onTop(event.nativeEvent.layout.y);
      }}
    >
      <RoomPhotosView
        rooms={rooms}
        selectedTableId={selectedTableId}
        // A table the slot will not give this party is drawn, not offered.
        partySize={partySize}
        title={
          <Text display accessibilityRole="header" numberOfLines={1} style={styles.pick}>
            {t('book.pickTable')}
          </Text>
        }
        notice={
          <>
            <Text style={styles.pickHint}>{t('book.pickTableHint')}</Text>
            <ConflictNote text={conflictText} />
          </>
        }
        photoStyle={styles.roomPhoto}
        onSelect={onSelect}
      />
      <TableLegend partyFit request={anyRequest} style={styles.legend} />
    </View>
  );
}

export interface ChosenTableNoteProps {
  readonly chosenTable: ChosenTable | null;
  /** Why the chosen table cannot be had at this slot, if it cannot. */
  readonly chosenRefusal: string | null;
  /** The chosen table's answer at the slot. */
  readonly chosenAtSlot: TableAvailability | null;
  /** No table at all fits the party at a time that can be had. */
  readonly noTableFits: boolean;
  readonly noTableText: string;
  readonly timeZoneId: string;
}

/** The chosen table and what it comes with — or, with none, that no table fits. */
export function ChosenTableNote({
  chosenTable,
  chosenRefusal,
  chosenAtSlot,
  noTableFits,
  noTableText,
  timeZoneId,
}: ChosenTableNoteProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const capacityLabel = useCapacityLabel();
  if (!chosenTable) {
    return noTableFits ? (
      <Text accessibilityRole="alert" style={styles.warning}>
        {noTableText}
      </Text>
    ) : null;
  }
  return (
    <View>
      <View style={styles.tableCard}>
        <View style={styles.tableIcon}>
          <Ionicons name={actionIcon.table} size={iconSize.md} color={colors.primary} />
        </View>
        <View style={styles.tableBody}>
          <Text style={styles.tableCaption}>{t('book.selectedTable')}</Text>
          <View style={styles.tableLine}>
            {chosenTable.label ? (
              <Text numberOfLines={1} style={styles.tableText}>
                {t('tables.table', { label: chosenTable.label })}
              </Text>
            ) : null}
            <Text numberOfLines={1} style={styles.tableSeats}>
              {capacityLabel(chosenTable)}
            </Text>
          </View>
        </View>
      </View>
      {chosenRefusal ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          {chosenRefusal}
        </Text>
      ) : chosenAtSlot?.isBookable ? (
        <>
          {chosenAtSlot.isRequestable ? (
            <Text style={bookingStyles.slotNote}>
              {t(
                chosenAtSlot.requiresEarlierGuestConsent
                  ? 'table.requestable.earlierGuest'
                  : 'booking.approval.why',
              )}
            </Text>
          ) : null}
          {chosenAtSlot.mustFreeByUtc ? (
            <Text style={bookingStyles.slotNote}>
              {t('table.mustFreeBy', {
                time: formatTime(chosenAtSlot.mustFreeByUtc, timeZoneId, locale),
              })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pick: { fontSize: 16, lineHeight: 22, fontWeight: fontWeight.bold, color: colors.text },
  pickHint: { ...typography.caption, color: colors.textMuted },
  roomPhoto: { borderRadius: radius.card + 2 },
  legend: { marginTop: space.md },
  conflict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  conflictText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.errorInk },

  tableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBody: { flex: 1, gap: 2 },
  tableCaption: { ...typography.caption, color: colors.textMuted },
  tableLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  tableText: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text, flexShrink: 1 },
  tableSeats: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  warning: { ...typography.body, color: colors.warningInk, marginTop: space.sm },
});
