import type { ReportExport } from '@yalla/api';

/**
 * Hand the browser a file the server produced.
 *
 * The object URL is revoked on the next frame rather than immediately: revoking
 * it in the same tick races the click in Safari and produces a download that
 * silently does nothing, which is the worst outcome available — an owner who
 * thinks they exported a report and has no file.
 *
 * Nothing here inspects, reorders or re-encodes the bytes. They are the
 * server's CSV, complete with the UTF-8 BOM Excel needs to open an Armenian
 * venue name as words. If this function ever grows a row in it, the export has
 * stopped being the server's and started being an opinion.
 */
export function saveFile(file: ReportExport): void {
  const url = URL.createObjectURL(file.bytes);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  // Appended because Firefox will not act on a click for a detached element.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
