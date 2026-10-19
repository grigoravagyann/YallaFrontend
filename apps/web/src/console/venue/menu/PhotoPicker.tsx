import { isUnsupportedImage, type Photo } from '@yalla/api';
import { useUploadPhoto } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon } from '../../ui/icons';

/**
 * Attaching a photo to one dish: drop, crop, upload, see what a diner sees.
 *
 * The crop is not a nicety. Owner photos come off a phone in portrait, with the
 * dish somewhere left of centre, and the card the diner actually looks at is a
 * 4:3 landscape crop taken from the middle — so a photo that looks fine in the
 * form loses half the plate on the card. Cropping here, against the real
 * aspect ratio, is the only place that is visible before it is a diner's
 * problem.
 *
 * The preview is the card variant in the same 4:3 frame a guest sees it in
 * (Menu artboard), with "Change" — and "Remove", when the caller can take the
 * photo back — beside it. Used for dishes, room photos and the cover.
 */

export interface PhotoPickerProps {
  readonly branchId: string;
  readonly photo: Photo | null;
  readonly onChange: (photo: Photo) => void;
  /** Offers "Remove" beside "Change", for a photo the caller can take back. */
  readonly onRemove?: () => void;
}

/** The card variant's shape, from `PhotoRules`: 640 on the longest edge, 4:3. */
const CARD_ASPECT = 4 / 3;

/** What the server takes; the same list as the file input's `accept`. */
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function PhotoPicker({ branchId, photo, onChange, onRemove }: PhotoPickerProps) {
  const { t } = useTranslation(['admin', 'common']);
  const upload = useUploadPhoto(branchId);

  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are a leak if nothing revokes them, and a form somebody opens
  // twenty times in an afternoon leaks twenty full-size phone photos.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  const send = useCallback(
    async (file: Blob, fileName: string) => {
      setFailure(null);
      setProgress(0);
      try {
        const result = await upload.mutateAsync({
          file,
          fileName,
          onProgress: setProgress,
        });
        onChange(result.photo);
        setPending(null);
      } catch (error) {
        // The server sniffs the bytes and ignores the extension, so "that .jpg
        // is actually a HEIC" is a real and confusing case. Said plainly, with
        // what the bytes turned out to be when the server could tell.
        if (isUnsupportedImage(error)) {
          setFailure(
            error.reason === 'tooLarge'
              ? t('menu.photo.tooLarge')
              : error.reason === 'dimensions'
                ? t('menu.photo.badDimensions')
                : error.detectedFormat
                  ? t('menu.photo.wrongFormatDetected', { format: error.detectedFormat })
                  : t('menu.photo.wrongFormat'),
          );
        } else {
          setFailure(t('menu.photo.failed'));
        }
      } finally {
        setProgress(null);
      }
    },
    [onChange, t, upload],
  );

  function choose(file: File | undefined): void {
    if (!file) return;
    setFailure(null);
    if (pending) URL.revokeObjectURL(pending.url);
    // A drop ignores the input's `accept`, so a PDF arrives here too. Said
    // now, rather than as a broken picture in the framer. A file the browser
    // names an image but cannot draw (a HEIC renamed .jpg) is caught by the
    // framer itself, when it fails to open.
    if (file.type && !ACCEPTED.has(file.type)) {
      setPending(null);
      setFailure(t('menu.photo.wrongFormat'));
      return;
    }
    setPending({ file, url: URL.createObjectURL(file) });
  }

  return (
    <div
      className="yc-photo"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        choose(event.dataTransfer.files[0]);
      }}
    >
      {pending ? (
        <CropPane
          source={pending.url}
          busy={progress !== null}
          onCancel={() => {
            URL.revokeObjectURL(pending.url);
            setPending(null);
          }}
          onCrop={(blob) => void send(blob, pending.file.name)}
          onUnreadable={() => {
            URL.revokeObjectURL(pending.url);
            setPending(null);
            setFailure(t('menu.photo.unreadable'));
          }}
        />
      ) : (
        <>
          {photo?.cardUrl ? (
            // The card variant, in the 4:3 frame a guest sees it in.
            <img src={photo.cardUrl} alt={t('menu.photo.alt')} className="yc-photo-img" />
          ) : (
            <button type="button" className="yc-drop" onClick={() => inputRef.current?.click()}>
              <PlusIcon />
              {t('menu.photo.dropHere')}
            </button>
          )}
          <div className="yc-photo-side">
            <span className="yc-help">{t('menu.photo.accepted')}</span>
            {photo?.cardUrl ? (
              <div className="yc-photo-acts">
                <button
                  type="button"
                  className="yc-btn yc-btn-sec yc-btn-sm"
                  onClick={() => inputRef.current?.click()}
                >
                  {t('menu.photo.replace')}
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    className="yc-btn yc-btn-ghost yc-btn-sm"
                    onClick={onRemove}
                  >
                    {t('menu.photo.remove')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      {progress !== null ? (
        // A real bar, not a spinner: these are eight-megabyte phone photos on a
        // cafe's wifi, and the difference between waiting and reloading is
        // knowing something is happening.
        <div className="yc-upload">
          <progress value={progress} max={1} />
          <span className="yc-help">
            {t('menu.photo.uploading', { percent: Math.round(progress * 100) })}
          </span>
        </div>
      ) : null}
      {failure ? (
        <p className="yc-err yc-photo-err" role="alert">
          {failure}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // The same file again, after a cancel, is a change too.
          event.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * A crop to the card's aspect ratio, before anything is uploaded.
 *
 * Deliberately one control — a vertical offset — rather than a full crop tool.
 * The card's aspect is fixed, so the only genuine decision is which horizontal
 * band of a portrait photo the dish is in, and every extra handle is time an
 * owner spends on the twelfth of eighty photos.
 */
function CropPane({
  source,
  busy,
  onCrop,
  onCancel,
  onUnreadable,
}: {
  readonly source: string;
  readonly busy: boolean;
  readonly onCrop: (blob: Blob) => void;
  readonly onCancel: () => void;
  /** The browser could not draw the file: not a picture, whatever its name says. */
  readonly onUnreadable: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const imageRef = useRef<HTMLImageElement>(null);
  const [offset, setOffset] = useState(0.5);
  // Nothing to crop until the picture has opened: a click before then, or on
  // a file that never opens, would draw an empty canvas and do nothing.
  const [decoded, setDecoded] = useState(false);

  function crop(): void {
    const image = imageRef.current;
    if (!image || !decoded) return;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      onUnreadable();
      return;
    }

    // The widest 4:3 band that fits, positioned by the offset. A photo already
    // wider than 4:3 is cropped horizontally from the centre instead, which is
    // the case a laptop screenshot produces.
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const width = Math.min(naturalWidth, naturalHeight * CARD_ASPECT);
    const height = width / CARD_ASPECT;
    const left = (naturalWidth - width) / 2;
    const top = (naturalHeight - height) * offset;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);

    // JPEG at 0.9: the server re-encodes to WebP anyway, so this only has to
    // survive one more encode without visible loss, and a PNG of a photograph
    // would be four times the upload for nothing.
    canvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
        else onUnreadable();
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="yc-crop photo-crop">
      <div className="yc-crop-frame" style={{ aspectRatio: String(CARD_ASPECT) }}>
        <img
          ref={imageRef}
          src={source}
          alt=""
          style={{ objectPosition: `50% ${offset * 100}%` }}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth > 0) setDecoded(true);
            else onUnreadable();
          }}
          onError={onUnreadable}
        />
      </div>

      <div className="yc-crop-side">
        <label className="yc-fld">
          <span className="yc-lbl">{t('menu.photo.framing')}</span>
          <input
            type="range"
            className="yc-crop-range"
            min={0}
            max={1}
            step={0.01}
            value={offset}
            onChange={(event) => setOffset(Number(event.target.value))}
          />
        </label>
        <div className="yc-photo-acts">
          <button
            type="button"
            className="yc-btn yc-btn-pri yc-btn-sm"
            disabled={busy || !decoded}
            aria-busy={busy}
            onClick={crop}
          >
            {busy ? t('menu.photo.uploadingShort') : t('menu.photo.useThis')}
          </button>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={busy}
            onClick={onCancel}
          >
            {t('common:action.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
