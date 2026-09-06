import { isUnsupportedImage, type AdminMenuItem } from '@yalla/api';
import { useUploadPhoto, useUpdateMenuItem } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import { matchPhotos, stripExtension, type MatchConfidence } from './photoMatching';

/**
 * Thirty photos at once.
 *
 * This is most of an onboarding afternoon. The owner has a phone full of
 * photos; attaching them one at a time through a file picker is why the menu is
 * not finished when the team leaves.
 *
 * The shape of the screen follows one rule: **nothing is attached until
 * somebody has looked at it.** A photo on the wrong dish is found by a diner
 * weeks later and nobody connects it to an import, so every proposal is listed
 * with the dish it would go to, each can be dropped, and anything the matcher
 * was not sure about goes to a tray to be placed by hand. The tray is a normal
 * outcome, not a failure — on real camera filenames it is where most of them
 * land, and placing twelve by hand beside a list is still far faster than
 * opening twelve forms.
 */

export interface BulkPhotoDropProps {
  readonly branchId: string;
  readonly items: readonly AdminMenuItem[];
  readonly onClose: () => void;
}

interface Pending {
  readonly file: File;
  itemId: string | null;
  readonly confidence: MatchConfidence | null;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  message?: string;
}

export function BulkPhotoDrop({ branchId, items, onClose }: BulkPhotoDropProps) {
  const { t } = useTranslation(['admin', 'common']);
  const upload = useUploadPhoto(branchId);
  const updateItem = useUpdateMenuItem(branchId);

  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [running, setRunning] = useState(false);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function accept(files: FileList | null): void {
    if (!files || files.length === 0) return;
    const names = [...files].map((file) => file.name);
    const { matches } = matchPhotos(names, items);
    const matchByName = new Map(matches.map((match) => [match.fileName, match]));

    setPending(
      [...files].map((file) => {
        const match = matchByName.get(file.name);
        return {
          file,
          itemId: match?.itemId ?? null,
          confidence: match?.confidence ?? null,
          state: 'waiting' as const,
        };
      }),
    );
  }

  /**
   * Sequential, not parallel.
   *
   * Thirty eight-megabyte uploads at once on a cafe's wifi is thirty timeouts.
   * One at a time is slower on paper and finishes; the row-by-row progress is
   * also the only honest way to show where it has got to.
   */
  async function attachAll(): Promise<void> {
    setRunning(true);
    for (const [index, entry] of pending.entries()) {
      if (!entry.itemId || entry.state === 'done') continue;

      setPending((current) =>
        current.map((row, i) => (i === index ? { ...row, state: 'uploading' } : row)),
      );

      try {
        const result = await upload.mutateAsync({ file: entry.file, fileName: entry.file.name });
        await updateItem.mutateAsync({
          itemId: entry.itemId,
          patch: { photoId: result.photo.photoId },
        });
        setPending((current) =>
          current.map((row, i) => (i === index ? { ...row, state: 'done' } : row)),
        );
      } catch (error) {
        setPending((current) =>
          current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  state: 'failed',
                  message: isUnsupportedImage(error)
                    ? error.reason === 'tooLarge'
                      ? t('menu.photo.tooLarge')
                      : error.detectedFormat
                        ? t('menu.photo.wrongFormatDetected', { format: error.detectedFormat })
                        : t('menu.photo.wrongFormat')
                    : t('menu.photo.failed'),
                }
              : row,
          ),
        );
      }
    }
    setRunning(false);
  }

  const matched = pending.filter((entry) => entry.itemId !== null);
  const tray = pending.filter((entry) => entry.itemId === null);

  return (
    <div className="staff-dialog" role="dialog" aria-label={t('menu.bulk.title')}>
      <div className="card bulk-drop">
        <h2>{t('menu.bulk.title')}</h2>
        <p className="muted">{t('menu.bulk.body')}</p>

        {pending.length === 0 ? (
          <label
            className="photo-drop bulk-target"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              accept(event.dataTransfer.files);
            }}
          >
            <span>{t('menu.bulk.dropHere')}</span>
            <span className="small muted">{t('menu.photo.accepted')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) => accept(event.target.files)}
            />
          </label>
        ) : (
          <>
            <section>
              <h3>{t('menu.bulk.matchedTitle', { count: matched.length })}</h3>
              {matched.length === 0 ? (
                <p className="muted small">{t('menu.bulk.noneMatched')}</p>
              ) : (
                <ul className="bulk-list">
                  {matched.map((entry, index) => (
                    <li key={entry.file.name} className={`bulk-row state-${entry.state}`}>
                      <span className="bulk-file">{stripExtension(entry.file.name)}</span>
                      <span className="bulk-arrow" aria-hidden>
                        →
                      </span>
                      {/* Changeable. The matcher proposes; a person decides,
                          and changing one here is faster than dropping it into
                          the tray and starting again. */}
                      <select
                        className="field"
                        value={entry.itemId ?? ''}
                        disabled={running || entry.state === 'done'}
                        onChange={(event) =>
                          setPending((current) =>
                            current.map((row) =>
                              row.file === entry.file
                                ? { ...row, itemId: event.target.value || null }
                                : row,
                            ),
                          )
                        }
                      >
                        <option value="">{t('menu.bulk.leaveInTray')}</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <span className={`chip small confidence-${entry.confidence ?? 'near'}`}>
                        {t(`menu.bulk.confidence.${entry.confidence ?? 'near'}`)}
                      </span>
                      <span className="bulk-state small muted">
                        {entry.state === 'done'
                          ? t('menu.bulk.attached')
                          : entry.state === 'uploading'
                            ? t('menu.bulk.uploading')
                            : entry.state === 'failed'
                              ? (entry.message ?? t('menu.photo.failed'))
                              : ''}
                      </span>
                      <span className="visually-hidden">{index + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3>{t('menu.bulk.trayTitle', { count: tray.length })}</h3>
              <p className="muted small">{t('menu.bulk.trayBody')}</p>
              {tray.length > 0 ? (
                <ul className="bulk-list">
                  {tray.map((entry) => (
                    <li key={entry.file.name} className="bulk-row">
                      <span className="bulk-file">{entry.file.name}</span>
                      <select
                        className="field"
                        value=""
                        disabled={running}
                        onChange={(event) =>
                          setPending((current) =>
                            current.map((row) =>
                              row.file === entry.file
                                ? { ...row, itemId: event.target.value || null }
                                : row,
                            ),
                          )
                        }
                      >
                        <option value="">{t('menu.bulk.chooseDish')}</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {byId.get(item.id)?.photo.photoId
                              ? ` · ${t('menu.bulk.hasPhoto')}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </>
        )}

        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            disabled={running || matched.length === 0}
            onClick={() => void attachAll()}
          >
            {running ? t('menu.bulk.attaching') : t('menu.bulk.attach', { count: matched.length })}
          </button>
          <button type="button" className="button" disabled={running} onClick={onClose}>
            {t('common:action.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
