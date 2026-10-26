import { useEffect, useId, useRef, type ReactNode } from 'react';

/** The panel's facts, as a definition list. */
export function Facts({ children }: { readonly children: ReactNode }) {
  return <dl className="tp-facts">{children}</dl>;
}

/** One fact: its label, and its value. */
export function Fact({
  label,
  warn = false,
  text = false,
  children,
}: {
  readonly label: string;
  readonly warn?: boolean;
  /** Words, not a figure (a name): wrapped between words, and a row of its own on the phone. */
  readonly text?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={text ? 'tp-fact is-text' : 'tp-fact'}>
      <dt>{label}</dt>
      <dd className={warn ? 'is-warn' : undefined}>{children}</dd>
    </div>
  );
}

/** A note that never blocks: amber for waiting, blue for the guest's side, red for a real problem. */
export function Warn({
  tone,
  children,
}: {
  readonly tone: 'amber' | 'blue' | 'red';
  readonly children: ReactNode;
}) {
  return (
    <p className="tp-warn" data-tone={tone}>
      {children}
    </p>
  );
}

/** A question in the panel, named by its title, so a reader knows what the buttons answer. */
export function Confirm({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  const ref = useInView();
  return (
    <div ref={ref} className="tp-confirm" role="group" aria-labelledby={id} tabIndex={-1}>
      <h3 id={id}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * A question scrolled into the panel's view when it opens. It replaces the
 * button that asked it, low in a tall panel, and its answer must not be the
 * thing a waiter has to scroll to find.
 */
export function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return ref;
}
