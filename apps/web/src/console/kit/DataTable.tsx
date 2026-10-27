import { useLayoutEffect, useRef, type ReactNode } from 'react';
import '../ui/console.css';
import '../ui/phone-tables.css';

/**
 * How a table sits on a phone (`max-width: 760px`):
 * - `scroll` (the default) keeps its columns and scrolls sideways in its card;
 * - `cards` stacks each row as a card. The row's title cell (a `yc-tc-main`
 *   cell, else a `th scope="row"`, else the first cell) heads it; the row's
 *   actions (a `yc-mcell` or `yc-tc-act` cell) sit top-right, always in view;
 *   every other cell is a line labelled with its column's header. The
 *   header's `data-label` names the column when its text would not (an
 *   icon); a cell's own `data-label` wins, and `data-label=""` shows none.
 *   Header cells with a button (a sort) stay above the cards as a strip.
 */
export type PhoneLayout = 'scroll' | 'cards';

/**
 * The console's table: scrolls sideways inside its card on a narrow screen,
 * or stacks as cards (`phone="cards"`), and always has a name — a caption,
 * visually hidden unless `captionClassName` says otherwise, or the heading
 * `labelledBy` points at — so a screen reader's table list names it.
 *
 * `busy` while the rows on screen are the previous filters' (placeholder
 * data): `aria-busy` tells a screen reader to wait for the new ones.
 */
export function DataTable({
  caption,
  captionClassName = 'yc-sr',
  labelledBy,
  className,
  busy = false,
  phone = 'scroll',
  children,
}: {
  readonly captionClassName?: string;
  /** Added to `yc-tbl`: the page's own column widths. */
  readonly className?: string;
  readonly busy?: boolean;
  readonly phone?: PhoneLayout;
  /** The `thead` (see `TableHead`), `tbody` and `tfoot`. */
  readonly children: ReactNode;
} & (
  | { readonly caption: ReactNode; readonly labelledBy?: undefined }
  /** The id of the heading above that already names the table. */
  | { readonly caption?: undefined; readonly labelledBy: string }
)) {
  const ref = useRef<HTMLTableElement>(null);
  const cards = phone === 'cards';

  useLayoutEffect(() => {
    const table = ref.current;
    if (!cards || !table) return;
    labelCells(table);
    // Rows a child adds or relabels on its own render (a page of rows, a
    // language switch) are labelled too; setting the labels is not observed.
    const observer = new MutationObserver(() => labelCells(table));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [cards]);

  const classes = ['yc-tbl', className, cards ? 'yc-cards' : null].filter(Boolean).join(' ');
  return (
    <div className="yc-tscroll">
      <table
        ref={ref}
        className={classes}
        aria-busy={busy || undefined}
        aria-labelledby={labelledBy}
      >
        {caption === undefined ? null : <caption className={captionClassName}>{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/** Cells a table labelled itself, so a new header text replaces their label. */
const autoLabelled = new WeakSet<Element>();

/** A header's words as a reader sees them: icons and arrows (`aria-hidden`) left out. */
function headerText(cell: HTMLTableCellElement): string {
  const own = cell.getAttribute('data-label');
  if (own !== null) return own;
  const copy = cell.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

/** Gives each body and footer cell its column's header as `data-label`, for the phone's cards. */
function labelCells(table: HTMLTableElement) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  const labels: string[] = [];
  if (head) {
    for (const cell of Array.from(head.cells)) {
      labels.push(headerText(cell));
      for (let extra = 1; extra < cell.colSpan; extra++) labels.push('');
    }
  }
  const sections = [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])];
  for (const section of sections) {
    for (const row of Array.from(section.rows)) {
      let column = 0;
      for (const cell of Array.from(row.cells)) {
        if (!cell.hasAttribute('data-label') || autoLabelled.has(cell)) {
          // A cell across columns (an empty line) says nothing per column.
          const label = cell.colSpan === 1 ? (labels[column] ?? '') : '';
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
          autoLabelled.add(cell);
        }
        column += cell.colSpan;
      }
    }
  }
}

export interface TableColumn {
  readonly label: ReactNode;
  /** A column of figures: right-aligned with tabular digits (`yc-num`). */
  readonly numeric?: boolean;
}

/** A header row of column headers, each `scope="col"`. */
export function TableHead({ columns }: { readonly columns: readonly TableColumn[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column, index) => (
          <th key={index} scope="col" className={column.numeric ? 'yc-num' : undefined}>
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * A cell with nothing in it: a dash to the eye, `label` ("No device",
 * "Nothing measured") to a screen reader, which would otherwise read "dash".
 */
export function NoValue({ label }: { readonly label: string }) {
  return (
    <>
      <span aria-hidden="true">{'—'}</span>
      <span className="yc-sr">{label}</span>
    </>
  );
}
