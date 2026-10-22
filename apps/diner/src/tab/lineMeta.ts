import type { CopyLine } from '@yalla/api';
import { formatTime, type Locale } from '@yalla/format';
import type { RenderedLine } from './projection';

/**
 * The small line under a dish on the bill: who it is, when it was ordered, and
 * how it splits — "Աննա · 19:08", "Yours · 19:12 · Shared 3 ways".
 *
 * The time is the line's order's (`orderedAtUtc`), in the **branch's** zone,
 * never the device's: a tourist's phone on Moscow time still reads the
 * kitchen's clock. Through `formatTime`, the formatter every other time on the
 * phone goes through, so Hermes needs no Intl it does not already polyfill.
 *
 * A line without a time — an older server, or a value that is not an instant —
 * says who alone, rather than a blank or a broken clock.
 *
 * Returned as parts, a translation key or plain text each, for the row to
 * translate and join with " · ".
 */
export function lineMetaParts(
  line: Pick<
    RenderedLine,
    'isMine' | 'orderedByName' | 'orderedAtUtc' | 'isShared' | 'sharedWithCount'
  >,
  timeZoneId: string,
  locale: Locale,
): readonly (CopyLine | string)[] {
  const who: CopyLine = line.isMine
    ? { key: 'bill.yours', params: {} }
    : line.orderedByName
      ? { key: 'bill.orderedBy', params: { name: line.orderedByName } }
      : { key: 'bill.forTheTable', params: {} };

  const time = orderedAt(line.orderedAtUtc, timeZoneId, locale);

  // How many ways it splits, from the snapshot taken when it was ordered.
  const split: CopyLine | null = line.isShared
    ? line.sharedWithCount > 1
      ? { key: 'bill.sharedWays', params: { count: line.sharedWithCount } }
      : { key: 'bill.shared', params: {} }
    : null;

  return [who, ...(time ? [time] : []), ...(split ? [split] : [])];
}

/** The parts, translated and joined: what the row prints. */
export function lineMetaText(
  parts: readonly (CopyLine | string)[],
  translate: (copy: CopyLine) => string,
): string {
  return parts.map((part) => (typeof part === 'string' ? part : translate(part))).join(' · ');
}

function orderedAt(value: string | null, timeZoneId: string, locale: Locale): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return formatTime(value, timeZoneId, locale);
}
