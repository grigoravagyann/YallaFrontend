/**
 * Read a QR code off the camera, with what the browser has.
 *
 * 1. **`BarcodeDetector`** where it exists and knows `qr_code` (Chrome on
 *    Android): native, fast, nothing downloaded.
 * 2. **jsQR** otherwise (Safari on iOS has no `BarcodeDetector`): a small pure
 *    JavaScript decoder, loaded only on this path and only when the camera is
 *    opened, so nobody else downloads it.
 * 3. Neither, or no camera: the pairing screen's typed code.
 */

export interface QrDetector {
  /** Which reader it is, for tests and for the curious. */
  readonly kind: 'native' | 'jsqr';
  /** The text of the first QR code in the frame, or null when there is none. */
  detect(video: HTMLVideoElement): Promise<string | null>;
}

interface NativeBarcode {
  readonly rawValue: string;
}

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<readonly NativeBarcode[]>;
}

interface NativeBarcodeDetectorClass {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<readonly string[]>;
}

async function nativeDetector(): Promise<QrDetector | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    return {
      kind: 'native',
      async detect(video) {
        const found = await detector.detect(video);
        return found[0]?.rawValue ?? null;
      },
    };
  } catch {
    return null;
  }
}

/** The longest side jsQR is given: plenty for a QR filling a third of the frame, and quick. */
const JSQR_MAX_SIDE = 640;

async function jsqrDetector(): Promise<QrDetector | null> {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  return {
    kind: 'jsqr',
    async detect(video) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;
      const scale = Math.min(1, JSQR_MAX_SIDE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      });
      return found?.data || null;
    },
  };
}

/** The best reader this browser has; null when it can read none. */
export async function createQrDetector(): Promise<QrDetector | null> {
  const native = await nativeDetector();
  if (native) return native;
  try {
    return await jsqrDetector();
  } catch {
    return null;
  }
}

/** Whether there is any camera API to ask for at all. */
export function cameraAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  );
}
