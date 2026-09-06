import { isUnsupportedImage, type Photo } from '@yalla/api';
import { useUploadPhoto } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';

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
 * The preview is shown at **diner card size**, not at whatever the form has
 * room for. A photo that reads perfectly at 400px and is an unidentifiable
 * brown rectangle at 120 is worth catching in an afternoon of onboarding rather
 * than in the app.
 */

export interface PhotoPickerProps {
  readonly branchId: string;
  readonly photo: Photo | null;
  readonly onChange: (photo: Photo) => void;
}

/** The card variant's shape, from `PhotoRules`: 640 on the longest edge, 4:3. */
const CARD_ASPECT = 4 / 3;

/** What a diner's card is actually drawn at. The preview matches it exactly. */
const DINER_CARD_WIDTH = 160;

export function PhotoPicker({ branchId, photo, onChange }: PhotoPickerProps) {
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
    setPending({ file, url: URL.createObjectURL(file) });
  }

  return (
    <div className="photo-picker">
      <div
        className="photo-drop"
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
          />
        ) : photo?.cardUrl ? (
          <div className="photo-current">
            {/* At the size a diner sees, and labelled as such. The variant is
                named because "which of the three am I looking at" is the
                question this panel exists to answer. */}
            <img
              src={photo.cardUrl}
              alt=""
              width={DINER_CARD_WIDTH}
              height={Math.round(DINER_CARD_WIDTH / CARD_ASPECT)}
              className="photo-card-preview"
            />
            <div>
              <p className="small muted">{t('menu.photo.variantCard')}</p>
              <p className="small muted">
                {t('menu.photo.dinerSize', { width: DINER_CARD_WIDTH })}
              </p>
              <button type="button" className="button" onClick={() => inputRef.current?.click()}>
                {t('menu.photo.replace')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="photo-empty" onClick={() => inputRef.current?.click()}>
            <span>{t('menu.photo.dropHere')}</span>
            <span className="small muted">{t('menu.photo.accepted')}</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>

      {progress !== null ? (
        // A real bar, not a spinner: these are eight-megabyte phone photos on a
        // cafe's wifi, and the difference between waiting and reloading is
        // knowing something is happening.
        <div className="upload-progress">
          <progress value={progress} max={1} />
          <span className="small muted">
            {t('menu.photo.uploading', {
              percent: Math.round(progress * 100),
            })}
          </span>
        </div>
      ) : null}

      {failure ? (
        <p className="error" role="alert">
          {failure}
        </p>
      ) : null}
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
}: {
  readonly source: string;
  readonly busy: boolean;
  readonly onCrop: (blob: Blob) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const imageRef = useRef<HTMLImageElement>(null);
  const [offset, setOffset] = useState(0.5);

  function crop(): void {
    const image = imageRef.current;
    if (!image) return;

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
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="photo-crop">
      <div className="photo-crop-frame" style={{ aspectRatio: String(CARD_ASPECT) }}>
        <img
          ref={imageRef}
          src={source}
          alt=""
          style={{ objectPosition: `50% ${offset * 100}%` }}
        />
      </div>

      <label className="labelled small">
        {t('menu.photo.framing')}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={offset}
          onChange={(event) => setOffset(Number(event.target.value))}
        />
      </label>

      <div className="actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={crop}>
          {busy ? t('menu.photo.uploadingShort') : t('menu.photo.useThis')}
        </button>
        <button type="button" className="button" disabled={busy} onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </div>
  );
}
