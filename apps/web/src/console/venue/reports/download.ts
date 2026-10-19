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
