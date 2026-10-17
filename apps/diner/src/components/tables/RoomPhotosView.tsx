import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PlaceRoom, RoomPhoto, TablePhotoMarker } from '../../places/model';
import { roomOfTable } from '../../places/rooms';
import { colors, fontWeight, layout, radius, space, tabularNumbers, typography } from '../../theme';
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
  /**
   * A heading for the block ("Pick a table"). Given, the room tabs move to
   * its right as one glass segmented pill instead of a row of chips above.
   */
  readonly title?: ReactNode;
  /** Laid between the room tabs and the photo: a hint, or why the last try failed. */
  readonly notice?: ReactNode;
  /** Extra style for each photo's frame — its corner radius, say. */
  readonly photoStyle?: StyleProp<ViewStyle>;
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
  title,
  notice,
  photoStyle,
  style,
}: RoomPhotosViewProps) {
  const { t } = useTranslation('diner');
  const [initial] = useState(() => roomOfTable(rooms, selectedTableId));
  const [roomId, setRoomId] = useState<string | null>(initial?.roomId ?? null);
  const [photoIndexes, setPhotoIndexes] = useState<Readonly<Record<string, number>>>(() =>
    initial ? { [initial.roomId]: initial.photoIndex } : {},
  );
  const [width, setWidth] = useState(0);
  // Per photo, so one page mounting or unzooming never unlocks another.
  const [zoomedPhotos, setZoomedPhotos] = useState<Readonly<Record<string, boolean>>>({});
  const list = useRef<FlatList<RoomPhoto>>(null);

  const room = rooms.find((candidate) => candidate.roomId === roomId) ?? rooms[0];
  const count = room?.photos.length ?? 0;
  const index = Math.min(room ? (photoIndexes[room.roomId] ?? 0) : 0, Math.max(0, count - 1));
  const zoomed = Boolean(room && zoomedPhotos[room.photos[index]?.photoId ?? '']);

  const setZoomed = useCallback((photoId: string, value: boolean) => {
    setZoomedPhotos((current) =>
      Boolean(current[photoId]) === value ? current : { ...current, [photoId]: value },
    );
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // A new width (rotation, a resized window) moves every page; keep the one
  // on screen. Read through a ref so a swipe does not scroll it back.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    if (width > 0 && indexRef.current > 0) {
      list.current?.scrollToIndex({ index: indexRef.current, animated: false });
    }
  }, [width]);

  /*
   * The page on screen, from the scroll itself rather than its momentum end:
   * React Native Web never fires `onMomentumScrollEnd`, so on the web the
   * counter and the remembered photo would never move.
   */
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

  const roomTabs =
    rooms.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={t('tables.rooms')}
        style={title ? styles.segmentedScroll : undefined}
        contentContainerStyle={title ? styles.segmented : styles.rooms}
      >
        {rooms.map((candidate) =>
          title ? (
            <RoomTab
              key={candidate.roomId}
              label={candidate.name}
              selected={candidate.roomId === room.roomId}
              onPress={() => setRoomId(candidate.roomId)}
            />
          ) : (
            <Chip
              key={candidate.roomId}
              label={candidate.name}
              size="sm"
              accessibilityRole="tab"
              selected={candidate.roomId === room.roomId}
              onPress={() => setRoomId(candidate.roomId)}
            />
          ),
        )}
      </ScrollView>
    ) : (
      <Text numberOfLines={1} style={title ? styles.roomNameAside : styles.roomName}>
        {room.name}
      </Text>
    );

  return (
    <View style={style}>
      {title ? (
        <View style={styles.titleRow}>
          <View style={styles.title}>{title}</View>
          {roomTabs}
        </View>
      ) : (
        roomTabs
      )}
      {notice ? <View style={styles.notice}>{notice}</View> : null}

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
            ref={list}
            keyExtractor={(photo) => photo.photoId}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScroll={onPaged}
            scrollEventThrottle={32}
            renderItem={({ item }) => (
              <View style={{ width }}>
                <TablePhotoView
                  photo={item}
                  selectedTableId={selectedTableId}
                  onSelect={onSelect}
                  onBook={onBook}
                  canBook={canBook}
                  partySize={partySize}
                  onZoomedChange={(value) => setZoomed(item.photoId, value)}
                  style={photoStyle}
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
            onZoomedChange={(value) => setZoomed(room.photos[index]!.photoId, value)}
            style={photoStyle}
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

/** One room in the segmented pill: the brand fill when it is the room on show. */
function RoomTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      // The web build reads none of accessibilityState.
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roomTab,
        selected && styles.roomTabOn,
        pressed && !selected && styles.roomTabPressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.roomTabLabel, selected && styles.roomTabLabelOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rooms: { gap: space.sm, paddingBottom: space.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  title: { flexShrink: 1 },
  notice: { gap: space.sm, marginBottom: space.md },
  segmentedScroll: { flexGrow: 0, flexShrink: 1, marginLeft: 'auto' },
  segmented: {
    gap: space.xs,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  roomTab: {
    minHeight: layout.touchTarget,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTabOn: { backgroundColor: colors.brand },
  roomTabPressed: { backgroundColor: colors.surfaceMuted },
  roomTabLabel: { ...typography.caption, color: colors.textMuted },
  roomTabLabelOn: { fontWeight: fontWeight.bold, color: colors.onPrimary },
  roomNameAside: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 'auto',
    flexShrink: 1,
  },
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
