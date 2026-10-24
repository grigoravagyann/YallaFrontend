import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { cameraAvailable, createQrDetector } from './qrDetector';

export interface QrScannerProps {
  /** Every QR the camera reads; the caller decides whether it is a pairing code. */
  readonly onText: (text: string) => void;
  /** No camera, or it was refused: the caller offers the typed code. */
  readonly onUnavailable?: (() => void) | undefined;
  /** A note under the frame: "that QR code is not a pairing code". */
  readonly note?: string | null | undefined;
}

/** How often a frame is read: often enough to feel instant, rarely enough to stay cool. */
const SCAN_EVERY_MS = 250;

type CameraState = 'starting' | 'live' | 'denied' | 'none';

/**
 * The back camera, a frame to aim with, and a reader behind it (Main
 * artboard, "scan"). The stream is stopped the moment this unmounts — a
 * camera left on in a waiter's pocket is a battery and a privacy problem.
 */
export function QrScanner({ onText, onUnavailable, note }: QrScannerProps) {
  const { t } = useTranslation(['staff']);
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>(() => (cameraAvailable() ? 'starting' : 'none'));
  const handler = useRef(onText);
  useEffect(() => {
    handler.current = onText;
  });

  useEffect(() => {
    if (state === 'none' || state === 'denied') onUnavailable?.();
  }, [state, onUnavailable]);

  useEffect(() => {
    if (!cameraAvailable()) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error) {
        if (!stopped) {
          setState(
            error instanceof DOMException &&
              (error.name === 'NotAllowedError' || error.name === 'SecurityError')
              ? 'denied'
              : 'none',
          );
        }
        return;
      }
      if (stopped || !video.current) {
        stop();
        return;
      }
      video.current.srcObject = stream;
      try {
        await video.current.play();
      } catch {
        // Autoplay of a muted inline stream is allowed everywhere it matters;
        // a refusal here still shows the first frame.
      }
      const detector = await createQrDetector();
      if (stopped) return;
      if (!detector) {
        stop();
        setState('none');
        return;
      }
      setState('live');
      const tick = async () => {
        if (stopped || !video.current) return;
        try {
          const text = await detector.detect(video.current);
          if (text && !stopped) handler.current(text);
        } catch {
          // A frame that could not be read: the next one will be.
        }
        if (!stopped) timer = setTimeout(() => void tick(), SCAN_EVERY_MS);
      };
      void tick();
    })();

    return stop;
  }, []);

  return (
    <div className="ph-scan">
      <div className="ph-scan-view">
        <video ref={video} className="ph-scan-video" muted playsInline aria-hidden="true" />
        <div className="ph-scan-frame" aria-hidden="true">
          <span>
            {state === 'starting' ? t('phone.pair.cameraStarting') : t('phone.pair.scanAim')}
          </span>
        </div>
      </div>
      <p className="ph-scan-help" role="status">
        {state === 'denied'
          ? t('phone.pair.cameraDenied')
          : state === 'none'
            ? t('phone.pair.cameraNone')
            : (note ?? t('phone.pair.scanHelp'))}
      </p>
    </div>
  );
}
