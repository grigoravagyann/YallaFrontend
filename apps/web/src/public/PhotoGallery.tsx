import type { Photo, PublicPhoto } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { useDialogFocus } from '../components/useDialogFocus';
import { Icon } from './icons';

/**
 * The photos at the top of the branch page (Main artboard): the cover, and
 * under it four thumbnails — on a desktop a 2×2 grid beside it. The first
 * three put their photo on the cover; the fourth, when there are more than
 * four, opens every photo in a dialog.
 *
 * The cover is the venue's cover from the page itself, so it is there before
 * the listing arrives; the gallery joins it when the listing does. A photo
 * that fails to load is dropped rather than left as a broken frame, and a
 * venue with no photos at all gets no box pretending one is coming.
 *
 * While the listing loads, a venue with a cover gets the thumbnails' row as
 * four placeholders, so the name and the open state below do not jump down
 * when the photos arrive. (A venue whose listing then has no gallery loses
 * the row again: the rarer case, and a shorter page rather than a jump.)
 */
export function PhotoGallery({
  cover,
  gallery,
  loading = false,
}: {
  readonly cover: PublicPhoto | null;
  readonly gallery: readonly Photo[];
  /** The listing, and with it the gallery, is still on its way. */
  readonly loading?: boolean;
}) {
  const { t } = useTranslation('public');
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const photos = uniquePhotos([cover, ...gallery]).filter((photo) => !failed.has(photo.photoId));
  if (photos.length === 0) return null;

  const count = photos.length;
  const current = photos.find((photo) => photo.photoId === currentId) ?? photos[0]!;
  const fail = (photoId: string) => setFailed((previous) => new Set(previous).add(photoId));
  // Four tiles; with more photos than that, the fourth opens them all.
  const tiles = count > 1 ? photos.slice(0, 4) : [];
  const lastOpensAll = count > 4;
  const placeholder = loading && tiles.length === 0;

  return (
    <div className={tiles.length > 0 || placeholder ? 'pub-hero has-gallery' : 'pub-hero'}>
      <div className="pub-cover">
        <img
          src={current.cardUrl}
          alt=""
          width={current.width ?? 1600}
          height={current.height ?? 900}
          decoding="async"
          onError={() => fail(current.photoId)}
        />
        {count > 1 ? (
          // The thumbnails say which photo this is; the counter is for the eye.
          <span className="pub-cover-count" aria-hidden="true">
            {photos.indexOf(current) + 1} / {count}
          </span>
        ) : null}
      </div>

      {placeholder ? (
        <div className="pub-gallery is-loading" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="pub-skeleton" />
          ))}
        </div>
      ) : null}

      {tiles.length > 0 ? (
        <div className="pub-gallery" role="group" aria-label={t('gallery.label')}>
          {tiles.map((photo, index) => {
            const opensAll = lastOpensAll && index === tiles.length - 1;
            return (
              <button
                key={photo.photoId}
                type="button"
                aria-label={
                  opensAll
                    ? t('gallery.all', { count })
                    : t('gallery.photo', { index: index + 1, count })
                }
                aria-pressed={opensAll ? undefined : photo.photoId === current.photoId}
                onClick={() => (opensAll ? setDialogOpen(true) : setCurrentId(photo.photoId))}
              >
                <img
                  src={photo.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => fail(photo.photoId)}
                />
                {opensAll ? (
                  <span className="pub-gallery-more" aria-hidden="true">
                    {t('gallery.allShort')}
                    <br />
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {dialogOpen ? (
        <GalleryDialog photos={photos} onFail={fail} onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}

/** The cover first, then the gallery in the venue's order, each photo once. */
function uniquePhotos(candidates: readonly (Photo | null)[]): Photo[] {
  const seen = new Set<string>();
  const photos: Photo[] = [];
  for (const photo of candidates) {
    if (!photo || seen.has(photo.photoId)) continue;
    seen.add(photo.photoId);
    photos.push(photo);
  }
  return photos;
}

/**
 * Every photo, two to a row, in a modal dialog: focus on Close as it opens,
 * Tab kept inside, Escape and Close shut it and focus goes back to the
 * thumbnail that opened it. A tap on the scrim outside the photos closes it
 * too, as a phone user expects. A photo that fails to load is dropped here
 * as on the page. The page behind does not scroll while it is open.
 */
function GalleryDialog({
  photos,
  onFail,
  onClose,
}: {
  readonly photos: readonly Photo[];
  readonly onFail: (photoId: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('public');
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useDialogFocus(panelRef, { onEscape: onClose });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const count = photos.length;

  return (
    // The scrim's tap is the pointer's shortcut for Close; the keyboard has
    // Escape and the Close button, so it needs no key handler of its own.
    <div
      className="pub-gallery-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="pub-gallery-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <div className="pub-gallery-head">
          <h2 id={headingId}>{t('gallery.title', { count })}</h2>
          <button
            type="button"
            className="pub-icon-button"
            aria-label={t('gallery.close')}
            data-autofocus
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <ul className="pub-gallery-grid">
          {photos.map((photo, index) => (
            <li key={photo.photoId}>
              <img
                src={photo.cardUrl}
                alt={t('gallery.photo', { index: index + 1, count })}
                width={photo.width ?? 1600}
                height={photo.height ?? 1200}
                loading="lazy"
                decoding="async"
                onError={() => onFail(photo.photoId)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
