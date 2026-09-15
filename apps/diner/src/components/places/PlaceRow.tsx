import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Place } from '../../places/model';
import { actionIcon, colors, fontWeight, radius, space, typography } from '../../theme';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { PlaceMetaRow, usePlaceCopy } from './placeCopy';
import { placeTitle } from './placeTitle';

const THUMB = 72;

export interface PlaceRowProps {
  readonly place: Place;
  readonly onViewDetails: () => void;
  readonly onDirections: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The one place the map is showing you: thumbnail, name and badge, the type
 * line, distance and rating, the Open / Closed pill, and the two things to do
 * about it. Sits inside `BottomSheetCard`, which brings the white card and
 * the slide; this is only the contents.
 */
export function PlaceRow({ place, onViewDetails, onDirections, style }: PlaceRowProps) {
  const { t } = useTranslation('diner');
  const copy = usePlaceCopy(place);
  const contentBadge = place.badges[0];
  const status = place.openState.isOpen ? 'open' : 'closed';
  const photo = place.photos[0];
  const title = placeTitle(place);

  return (
    <View style={style}>
      <View style={styles.top}>
        <PhotoImage source={photo} style={styles.thumb} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.name} accessibilityLabel={title.label}>
              {title.venue}
            </Text>
            {contentBadge ? <Badge variant={contentBadge} tone="soft" size="sm" /> : null}
          </View>
          {title.branch ? (
            // Read as part of the name above, so it is not announced twice.
            <Text
              numberOfLines={1}
              style={styles.branch}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              {title.branch}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={styles.typeLine}>
            {copy.typeLine}
          </Text>
          <View style={styles.metaRow}>
            <PlaceMetaRow place={place} order="distanceFirst" style={styles.meta} />
            <Badge variant={status} tone="soft" size="sm" />
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={t('map.viewDetails')}
          onPress={onViewDetails}
          fullWidth={false}
          style={styles.action}
        />
        <Button
          label={t('map.directions')}
          onPress={onDirections}
          variant="secondary"
          icon={actionIcon.directions}
          fullWidth={false}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  body: { flex: 1, justifyContent: 'center', gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flexShrink: 1 },
  branch: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  typeLine: { ...typography.caption, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1, paddingHorizontal: space.md },
});
