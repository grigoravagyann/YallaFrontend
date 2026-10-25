import { ApiError } from '@yalla/api';
import { intlTag, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useToast } from '../ui/toast';

/**
 * Hand the browser a file to save.
 *
 * The object URL is revoked on the next frame rather than immediately: revoking
 * it in the same tick races the click in Safari and produces a download that
 * silently does nothing, which is the worst outcome available — an owner who
 * thinks they exported a report and has no file.
 */
export function saveFile(fileName: string, bytes: Blob): void {
  const url = URL.createObjectURL(bytes);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // Appended because Firefox will not act on a click for a detached element.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `422 activity-export-too-large`: the window holds more rows than one file may. */
export const ACTIVITY_EXPORT_TOO_LARGE_CODE = 'activity-export-too-large';

/**
 * What a failed CSV says: the too-large refusal with the server's own limit
 * (`context.maxRows`) and how to narrow it; anything else, try again.
 */
export function csvFailureText(t: TFunction, error: unknown, locale: Locale): string {
  if (error instanceof ApiError && error.code === ACTIVITY_EXPORT_TOO_LARGE_CODE) {
    const said = error.problem?.context?.['maxRows'];
    const max = typeof said === 'number' && Number.isFinite(said) ? said : 20_000;
    return t('activity.csvTooLarge', { max: new Intl.NumberFormat(intlTag(locale)).format(max) });
  }
  return t('activity.csvFailed');
}

/** A file to save: the server's (its name from `Content-Disposition`) or one made here. */
export interface ExportedFile {
  readonly fileName: string;
  readonly bytes: Blob;
}

/**
 * A "Download CSV" action: busy while the file is made or fetched, saved
 * when it comes, and either way said in a toast — `ready` on success, the
 * failure (too large, with the server's limit, or try again) otherwise.
 * A second press while busy does nothing.
 */
export function useFileExport() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(make: () => Promise<ExportedFile>, ready: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const file = await make();
      saveFile(file.fileName, file.bytes);
      toast.say(ready);
    } catch (error) {
      toast.say(csvFailureText(t, error, locale), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return { busy, run } as const;
}
