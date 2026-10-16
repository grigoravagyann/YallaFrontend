import { useTranslation } from '@yalla/i18n';
import { useCallback, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PlaceRoom, TablePhotoMarker } from '../../places/model';
import { roomOfTable } from '../../places/rooms';
import { colors, fontWeight, radius, space, tabularNumbers, typography } from '../../theme';
import { Chip } from '../Chip';
import { Text } from '../Text';
import { TABLE_PHOTO_ASPECT, TablePhotoView } from './TablePhotoView';

export interface RoomPhotosViewProps {
  /** The rooms with photos, in the venue's order, each photo with its pins. */
  readonly rooms: readonly PlaceRoom[];
  readonly selectedTableId: string | null;
  /** A pin, or `null` for the photo away from any pin. */
  readonly onSelect: (tableId: string | null) => void;
  /** Book from the info bar on the photo; without it the screen acts on the selection. */
  readonly onBook?: ((table: TablePhotoMarker) => void) | undefined;
  /** False where the venue takes no app bookings: the bar says so, without Book. */
  readonly canBook?: boolean | undefined;
  /** The party being booked for: pins it cannot have are not offered. */
  readonly partySize?: number | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The venue's rooms as photos, every table a pin where it stands.
 *
 * A diner picks a room (Hall, Terrace) from the chips above, then swipes
 * through that room's photos. It opens on the room and photo of the selected
 * table, if there is one. Each room remembers which of its photos was showing,
 * and the pager stops swiping while a photo is zoomed so a drag pans it.
 */
export function RoomPhotosView({
  rooms,
  selectedTableId,
  onSelect,
  onBook,
  canBook,
  partySize,
  style,
}: RoomPhotosViewProps) {
  const { t } = useTranslation('diner');
  const [initial] = useState(() => roomOfTable(rooms, selectedTableId));
  const [roomId, setRoomId] = useState<string | null>(initial?.roomId ?? null);
  const [photoIndexes, setPhotoIndexes] = useState<Readonly<Record<string, number>>>(() =>
    initial ? { [initial.roomId]: initial.photoIndex } : {},
  );
  const [width, setWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const room = rooms.find((candidate) => candidate.roomId === roomId) ?? rooms[0];
  const count = room?.photos.length ?? 0;
  const index = Math.min(room ? (photoIndexes[room.roomId] ?? 0) : 0, Math.max(0, count - 1));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const onPaged = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!room || width <= 0) return;
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      const clamped = Math.max(0, Math.min(room.photos.length - 1, next));
      setPhotoIndexes((current) =>
        current[room.roomId] === clamped ? current : { ...current, [room.roomId]: clamped },
      );
    },
    [room, width],
  );

  if (!room) return null;

  return (
    <View style={style}>
      {rooms.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={t('tables.rooms')}
          contentContainerStyle={styles.rooms}
        >
          {rooms.map((candidate) => (
            <Chip
              key={candidate.roomId}
              label={candidate.name}
              size="sm"
              accessibilityRole="tab"
              selected={candidate.roomId === room.roomId}
              onPress={() => {
                setRoomId(candidate.roomId);
                setZoomed(false);
              }}
            />
          ))}
        </ScrollView>
      ) : (
        <Text numberOfLines={1} style={styles.roomName}>
          {room.name}
        </Text>
      )}

      <View onLayout={onLayout} style={styles.pager}>
        {width > 0 ? (
          // One pager per room, mounted once the width is known so it opens
          // on the photo the room was left at.
          <FlatList
            key={room.roomId}
            data={room.photos}
            horizontal
            pagingEnabled
            bounces={false}
            scrollEnabled={!zoomed && count > 1}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(photo) => photo.photoId}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onPaged}
            renderItem={({ item }) => (
              <View style={{ width }}>
                <TablePhotoView
                  photo={item}
                  selectedTableId={selectedTableId}
                  onSelect={onSelect}
                  onBook={onBook}
                  canBook={canBook}
                  partySize={partySize}
                  onZoomedChange={setZoomed}
                />
              </View>
            )}
          />
        ) : room.photos[index] ? (
          // Before the first layout: the photo alone, already tappable.
          <TablePhotoView
            photo={room.photos[index]}
            selectedTableId={selectedTableId}
            onSelect={onSelect}
            onBook={onBook}
            canBook={canBook}
            partySize={partySize}
            onZoomedChange={setZoomed}
          />
        ) : null}
        {count > 1 ? (
          <View pointerEvents="none" style={styles.counter}>
            <Text style={styles.counterText}>
              {t('place.photoCounter', { index: index + 1, total: count })}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rooms: { gap: space.sm, paddingBottom: space.sm },
  roomName: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.text,
    marginBottom: space.sm,
  },
  pager: { width: '100%', aspectRatio: TABLE_PHOTO_ASPECT },
  counter: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  counterText: {
    ...typography.caption,
    ...tabularNumbers,
    fontWeight: fontWeight.medium,
    color: colors.onImage,
  },
});
