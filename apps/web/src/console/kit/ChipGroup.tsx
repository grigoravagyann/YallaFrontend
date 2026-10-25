import type { ReactNode } from 'react';

export interface ChipOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  /** A count after the label ("Reported 3"); left out while unknown. */
  readonly count?: number | undefined;
}

/**
 * One-of-several filter chips: a labelled group of toggle buttons, the
 * chosen one pressed (`aria-pressed`) and filled (`is-on`).
 */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  small = false,
}: {
  /** The group's name for a screen reader: "Kind", "Period". */
  readonly label: string;
  readonly options: readonly ChipOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Added to `yc-chips`: the page's own placement. */
  readonly className?: string;
  /** The smaller chip (`yc-chip-sm`), for a group inside a card. */
  readonly small?: boolean;
}) {
  const base = small ? 'yc-chip yc-chip-sm' : 'yc-chip';
  return (
    <div
      className={className ? `yc-chips ${className}` : 'yc-chips'}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={on ? `${base} is-on` : base}
            aria-pressed={on}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <span className="yc-chip-n">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
