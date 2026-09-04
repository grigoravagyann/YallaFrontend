import { intlTag, type Locale } from './locale';

/**
 * A table's label as the venue wrote it, plus the floor area it sits in.
 *
 * Owners name tables inconsistently ("12", "T12", "Terrace 3", "Բալկոն 2"), so
 * the label is never generated — only decorated.
 */
export interface TableLabelInput {
  /** Exactly the label the owner typed in the floor plan editor. */
  readonly label: string;
  /** Floor area name, e.g. "Terrace". Already localised by the backend. */
  readonly areaName?: string | undefined;
  readonly seats?: number | undefined;
}

/**
 * Render a table label for a list row, e.g. `Terrace · T12`.
 *
 * The area is prefixed only when present: a single-room cafe has no areas and a
 * dangling separator looks broken.
 */
export function formatTableLabel(input: TableLabelInput): string {
  const label = input.label.trim();
  const area = input.areaName?.trim();

  return area ? `${area} · ${label}` : label;
}

/**
 * Render a table's seat count, e.g. `4 seats`.
 *
 * Returns the digits only; the word "seats" is translated copy and is applied by
 * the caller through i18n's plural handling. Exposed so that the numeral system
 * stays consistent with every other number in the UI.
 */
export function formatSeatCount(seats: number, locale: Locale): string {
  if (!Number.isInteger(seats) || seats < 0) {
    throw new RangeError(`formatSeatCount expects a non-negative integer, received ${seats}`);
  }
  return new Intl.NumberFormat(intlTag(locale)).format(seats);
}
