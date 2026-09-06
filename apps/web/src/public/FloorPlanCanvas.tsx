import type { FloorPlanData } from '@yalla/floorplan';
import { FloorPlan, Legend } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { useElementSize } from '../useElementSize';

/**
 * The room, read-only, in diner mode.
 *
 * **This module is the reason the public bundle is split three ways.** Importing
 * `@yalla/floorplan` pulls `react-native-web` and `react-native-svg` behind it —
 * a few hundred kilobytes that a visitor does not need to read a venue's name,
 * see that eight tables are free and decide whether to keep scrolling. It is
 * loaded lazily and only once the room scrolls into view; see `RoomSection`.
 *
 * The component itself is the same one the phone app and the counter tablet
 * render, from the same tokens. That is the point of the shared package: a
 * diner who books table 7 here and later installs the app sees the same room in
 * the same colours, and cannot be shown a table in a different place.
 *
 * Area mode is not configured here. On a narrow viewport the component decides
 * for itself whether the whole room survives — see `shouldUseAreaMode` — and
 * for a thirty-table restaurant on a 380pt phone it does not, so the plan
 * renders one area at a time with a switcher above it. That behaviour exists
 * because of this page.
 */
export interface FloorPlanCanvasProps {
  readonly plan: FloorPlanData;
  readonly partySize: number;
  readonly selectedTableId: string | null;
  readonly onTableTap: (tableId: string) => void;
}

export default function FloorPlanCanvas({
  plan,
  partySize,
  selectedTableId,
  onTableTap,
}: FloorPlanCanvasProps) {
  const { t } = useTranslation('public');
  const [planRef, size] = useElementSize<HTMLDivElement>();

  return (
    <>
      <div className="pub-legend" aria-label={t('room.legendLabel')}>
        <Legend mode="diner" translate={(key) => t(key, { ns: 'common' })} />
      </div>

      <p className="pub-muted pub-room-hint">{t('room.pick')}</p>

      {/*
        The box is measured rather than assumed: the plan scales to whatever it
        is given, and on this page that is a phone in portrait, a phone rotated,
        and a desktop window somebody is resizing.
      */}
      <div className="pub-plan" ref={planRef}>
        <FloorPlan
          plan={plan}
          mode="diner"
          partySize={partySize}
          selectedTableId={selectedTableId}
          onTableTap={onTableTap}
          viewport={size}
          // Required for area mode to engage at all — the switcher has words on
          // it. Bound to `common`, where the floor plan's own copy lives.
          translate={(key, params) => t(key, { ns: 'common', ...params })}
          accessibilityLabel={t('section.room')}
        />
      </div>
    </>
  );
}
