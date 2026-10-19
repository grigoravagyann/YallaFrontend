import { isUnsupportedImage, type AdminMenuItem } from '@yalla/api';
import { useUploadPhoto, useUpdateMenuItem } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useState } from 'react';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/toast';
import { matchPhotos, type MatchConfidence } from './photoMatching';

/**
 * Thirty photos at once (Menu artboard, "Photos in bulk").
 *
 * This is most of an onboarding afternoon. The owner has a phone full of
 * photos; attaching them one at a time through a file picker is why the menu is
 * not finished when the team leaves.
 *
 * The shape of the dialog follows one rule: **nothing is attached until
 * somebody has looked at it.** A photo on the wrong dish is found by a diner
 * weeks later and nobody connects it to an import, so every proposal is listed
 * with its picture and the dish it would go to, each can be unticked, and
 * anything the matcher could not place goes to a tray to be placed by hand.
 * The tray is a normal outcome, not a failure — on real camera filenames it is
 * where most of them land.
 */

export interface BulkPhotoDropProps {
  readonly branchId: string;
  readonly items: readonly AdminMenuItem[];
  readonly onClose: () => void;
}

interface Pending {
  readonly key: string;
  readonly file: File;
  /** A preview of the file, revoked when the dialog closes. */
  readonly url: string;
  /** The dish it goes to: the matcher's, or picked in the tray. */
  readonly itemId: string | null;
  readonly matched: boolean;
  readonly confidence: MatchConfidence | null;
  /** Unticked: listed, not attached. */
  readonly on: boolean;
  readonly state: 'waiting' | 'uploading' | 'done' | 'failed';
  readonly message?: string;
}

export function BulkPhotoDrop({ branchId, items, onClose }: BulkPhotoDropProps) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const upload = useUploadPhoto(branchId);
  const updateItem = useUpdateMenuItem(branchId);
  const inputId = useId();

  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [running, setRunning] = useState(false);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Previews are a leak if nothing revokes them: thirty full-size phone photos.
  const urls = useMemo(() => pending.map((entry) => entry.url).join('\n'), [pending]);
  useEffect(
    () => () => {
      for (const url of urls.split('\n')) if (url) URL.revokeObjectURL(url);
    },
    [urls],
  );

  function accept(files: FileList | null): void {
    if (!files || files.length === 0) return;
    const list = [...files];
    const { matches } = matchPhotos(
      list.map((file) => file.name),
      items,
    );
    const matchByName = new Map(matches.map((match) => [match.fileName, match]));
    setPending(
      list.map((file, index) => {
        const match = matchByName.get(file.name);
        return {
          key: `${index}:${file.name}`,
          file,
          url: URL.createObjectURL(file),
          itemId: match?.itemId ?? null,
          matched: Boolean(match),
          confidence: match?.confidence ?? null,
          on: true,
          state: 'waiting' as const,
        };
      }),
    );
  }

  function change(key: string, patch: Partial<Pending>): void {
    setPending((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const toAttach = pending.filter((entry) => entry.on && entry.itemId && entry.state !== 'done');
  const matched = pending.filter((entry) => entry.matched);
  const tray = pending.filter((entry) => !entry.matched);

  /**
   * Sequential, not parallel.
   *
   * Thirty eight-megabyte uploads at once on a cafe's wifi is thirty timeouts.
   * One at a time is slower on paper and finishes; the row-by-row state is
   * also the only honest way to show where it has got to.
   */
  async function attachAll(): Promise<void> {
    setRunning(true);
    let attached = 0;
    let failed = 0;
    for (const entry of toAttach) {
      change(entry.key, { state: 'uploading' });
      try {
        const result = await upload.mutateAsync({ file: entry.file, fileName: entry.file.name });
        await updateItem.mutateAsync({
          itemId: entry.itemId!,
          patch: { photoId: result.photo.photoId },
        });
        change(entry.key, { state: 'done' });
        attached += 1;
      } catch (error) {
        failed += 1;
        change(entry.key, {
          state: 'failed',
          message: isUnsupportedImage(error)
            ? error.reason === 'tooLarge'
              ? t('menu.photo.tooLarge')
              : error.detectedFormat
                ? t('menu.photo.wrongFormatDetected', { format: error.detectedFormat })
                : t('menu.photo.wrongFormat')
            : t('menu.photo.failed'),
        });
      }
    }
    setRunning(false);
    // Every one in: said, and done. A failure keeps the dialog, its row saying why.
    if (failed === 0) {
      toast.say(t('menu.bulk.done', { count: attached }));
      onClose();
    }
  }

  const stateLine = (entry: Pending) =>
    entry.state === 'done'
      ? t('menu.bulk.attached')
      : entry.state === 'uploading'
        ? t('menu.bulk.uploading')
        : entry.state === 'failed'
          ? (entry.message ?? t('menu.photo.failed'))
          : null;

  return (
    <Dialog
      title={t('menu.bulk.title')}
      description={t('menu.bulk.body')}
      onClose={onClose}
      dismissible={!running}
      wide
    >
      {pending.length === 0 ? (
        <label
          className="yc-drop yc-drop-wide"
          htmlFor={inputId}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            accept(event.dataTransfer.files);
          }}
        >
          <span>{t('menu.bulk.dropHere')}</span>
          <span className="yc-help">{t('menu.photo.accepted')}</span>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="yc-sr"
            data-autofocus=""
            onChange={(event) => accept(event.target.files)}
          />
        </label>
      ) : (
        <>
          <span className="yc-lbl">{t('menu.bulk.matchedTitle', { count: matched.length })}</span>
          {matched.length === 0 ? (
            <p className="yc-help">{t('menu.bulk.noneMatched')}</p>
          ) : (
            <ul className="yc-bulk">
              {matched.map((entry) => (
                <li key={entry.key}>
                  <img src={entry.url} alt="" />
                  <span className="yc-bulk-t">
                    <span className="yc-bulk-fn">{entry.file.name}</span>
                    <span className="yc-bulk-to">→ {byId.get(entry.itemId ?? '')?.name ?? ''}</span>
                    {stateLine(entry) ? <span className="yc-help">{stateLine(entry)}</span> : null}
                  </span>
                  <span
                    className={
                      entry.confidence === 'near'
                        ? 'yc-pill yc-pill-amber'
                        : 'yc-pill yc-pill-green'
                    }
                  >
                    {t(`menu.bulk.confidence.${entry.confidence ?? 'near'}`)}
                  </span>
                  <label className="yc-bulk-ck">
                    <input
                      type="checkbox"
                      checked={entry.on}
                      disabled={running || entry.state === 'done'}
                      onChange={() => change(entry.key, { on: !entry.on })}
                    />
                    <span className="yc-sr">
                      {t('menu.bulk.attachOne', { file: entry.file.name })}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {tray.length > 0 ? (
            <>
              <span className="yc-lbl">{t('menu.bulk.trayTitle', { count: tray.length })}</span>
              <ul className="yc-bulk">
                {tray.map((entry) => (
                  <li key={entry.key}>
                    <img src={entry.url} alt="" />
                    <span className="yc-bulk-t">
                      <span className="yc-bulk-fn">{entry.file.name}</span>
                      {stateLine(entry) ? (
                        <span className="yc-help">{stateLine(entry)}</span>
                      ) : null}
                    </span>
                    <label className="yc-sr" htmlFor={`${inputId}-${entry.key}`}>
                      {t('menu.bulk.chooseFor', { file: entry.file.name })}
                    </label>
                    <select
                      id={`${inputId}-${entry.key}`}
                      className="yc-ctl yc-bulk-sel"
                      value={entry.itemId ?? ''}
                      disabled={running || entry.state === 'done'}
                      onChange={(event) =>
                        change(entry.key, { itemId: event.target.value || null })
                      }
                    >
                      <option value="">{t('menu.bulk.chooseDish')}</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.photo.photoId
                            ? t('menu.bulk.hasPhoto', { name: item.name })
                            : item.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" disabled={running} onClick={onClose}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-pri"
          aria-disabled={toAttach.length === 0 || running}
          aria-busy={running}
          onClick={() => {
            if (toAttach.length === 0 || running) return;
            void attachAll();
          }}
        >
          {running ? t('menu.bulk.attaching') : t('menu.bulk.attach', { count: toAttach.length })}
        </button>
      </div>
    </Dialog>
  );
}
