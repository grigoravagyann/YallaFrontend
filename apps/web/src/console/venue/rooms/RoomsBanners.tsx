import type { ReplaceFloorPlanCommand } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { AlertCircleIcon, WarningIcon } from '../../ui/icons';
import type { DraftTable } from './roomsModel';
import { SaveRefusal } from './SaveRefusal';

export interface RoomsBannersProps {
  /** Somebody else saved the rooms since they were loaded. */
  readonly conflict: boolean;
  readonly reloadFailed: boolean;
  readonly onReload: () => void;
  /** The last save was refused (not for a conflict). */
  readonly saveFailed: boolean;
  readonly saveError: unknown;
  /** The command the refused save sent. */
  readonly sent: ReplaceFloorPlanCommand | null;
  readonly onRetrySave: () => void;
  /** Bookable tables on no photo, which diners are not offered. */
  readonly unpinnedBookable: readonly DraftTable[];
  readonly onPlace: (table: DraftTable) => void;
  readonly duplicates: readonly string[];
  readonly duplicateRooms: readonly string[];
  /** What the last save said, when it said anything. */
  readonly savedResult: readonly string[] | null;
}

/** The banners over the editor: a conflict or a refused save, then the draft's warnings. */
export function RoomsBanners({
  conflict,
  reloadFailed,
  onReload,
  saveFailed,
  saveError,
  sent,
  onRetrySave,
  unpinnedBookable,
  onPlace,
  duplicates,
  duplicateRooms,
  savedResult,
}: RoomsBannersProps) {
  const { t } = useTranslation(['admin', 'common']);
  const firstUnpinned = unpinnedBookable[0];
  return (
    <>
      {conflict ? (
        <div className="yc-banner yc-banner-red" role="alert">
          <WarningIcon />
          <span className="yc-grow">
            <b>{t('rooms.conflict.title')}</b> {t('rooms.conflict.body')}
            {reloadFailed ? <> {t('rooms.conflict.reloadFailed')}</> : null}
          </span>
          <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={onReload}>
            {t('rooms.conflict.reload')}
          </button>
        </div>
      ) : saveFailed ? (
        <SaveRefusal error={saveError} sent={sent} onRetry={onRetrySave} />
      ) : null}

      {firstUnpinned ? (
        <div className="yc-banner yc-banner-amber" role="status" data-testid="unpinned-warning">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.unpinned', {
              count: unpinnedBookable.length,
              labels: unpinnedBookable.map((table) => table.label).join(', '),
            })}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => onPlace(firstUnpinned)}
          >
            {t('rooms.warning.place', { label: firstUnpinned.label })}
          </button>
        </div>
      ) : null}
      {duplicates.length > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.duplicates', { labels: duplicates.join(', ') })}
          </span>
        </div>
      ) : null}
      {duplicateRooms.length > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.duplicateRooms', { names: duplicateRooms.join(', ') })}
          </span>
        </div>
      ) : null}
      {savedResult ? (
        <div className="yc-banner yc-banner-amber" role="status" data-testid="save-result">
          <AlertCircleIcon />
          <ul className="yc-grow yc-rm-lines">
            {savedResult.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
