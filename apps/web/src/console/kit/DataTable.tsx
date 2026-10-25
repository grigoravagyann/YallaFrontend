import type { ReactNode } from 'react';

/**
 * The console's table: scrolls sideways inside its card on a narrow screen,
 * and always has a caption — visually hidden unless `captionClassName` says
 * otherwise — so a screen reader's table list names it.
 *
 * `busy` while the rows on screen are the previous filters' (placeholder
 * data): `aria-busy` tells a screen reader to wait for the new ones.
 */
export function DataTable({
  caption,
  captionClassName = 'yc-sr',
  className,
  busy = false,
  children,
}: {
  readonly caption: ReactNode;
  readonly captionClassName?: string;
  /** Added to `yc-tbl`: the page's own column widths. */
  readonly className?: string;
  readonly busy?: boolean;
  /** The `thead` (see `TableHead`), `tbody` and `tfoot`. */
  readonly children: ReactNode;
}) {
  return (
    <div className="yc-tscroll">
      <table className={className ? `yc-tbl ${className}` : 'yc-tbl'} aria-busy={busy || undefined}>
        <caption className={captionClassName}>{caption}</caption>
        {children}
      </table>
    </div>
  );
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
