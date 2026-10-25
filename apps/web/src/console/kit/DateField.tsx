import { useId } from 'react';

/**
 * A labelled date box (`yyyy-MM-dd`) with its error under it.
 *
 * - `error`: this box's own sentence; the box is marked invalid and points
 *   at it.
 * - `invalid` + `describedBy`: an error said once for several boxes (a range
 *   that runs backwards), rendered by the page and pointed at from each.
 */
export function DateField({
  label,
  value,
  min,
  max,
  required = false,
  error = null,
  invalid = false,
  describedBy,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly min?: string | undefined;
  readonly max?: string | undefined;
  readonly required?: boolean;
  readonly error?: string | null;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const errorId = useId();
  const wrong = invalid || error !== null;
  const described = error !== null ? errorId : describedBy;
  return (
    <div className="yc-fld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        className="yc-ctl"
        value={value}
        min={min}
        max={max}
        required={required}
        aria-invalid={wrong ? true : undefined}
        aria-describedby={described}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error !== null ? (
        <span id={errorId} className="yc-err">
          {error}
        </span>
      ) : null}
    </div>
  );
}
