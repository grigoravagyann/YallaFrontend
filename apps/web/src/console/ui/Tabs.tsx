import { type KeyboardEvent, type ReactNode } from 'react';
import { useScrollStrip } from './scrollStrip';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** A small count after the label ("Staff 9"). */
  readonly badge?: ReactNode;
}

export interface TabsProps<T extends string> {
  /** Names the tab list for a screen reader. */
  readonly label: string;
  readonly tabs: readonly TabItem<T>[];
  readonly selected: T;
  readonly onSelect: (id: T) => void;
  /** Prefix for the tab and panel ids: `${idPrefix}-tab-${id}`, `${idPrefix}-panel-${id}`. */
  readonly idPrefix: string;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * Tabs on a roving tabindex (HANDOFF section 4): one Tab stop for the whole
 * list — the selected tab — and the arrow keys, Home and End move between
 * them, selecting as they go. The panel is the caller's, with
 * `role="tabpanel"`, `id={panelId(...)}` and `aria-labelledby={tabId(...)}`.
 *
 * On a phone the strip scrolls sideways: an overflowing edge fades, and the
 * selected tab is scrolled into view on mount and whenever it changes.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  idPrefix,
}: TabsProps<T>) {
  const stripRef = useScrollStrip<HTMLDivElement>('[aria-selected="true"]', [
    selected,
    tabs.length,
  ]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = tabs.findIndex((tab) => tab.id === selected);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? at === last
          ? 0
          : at + 1
        : event.key === 'ArrowLeft'
          ? at === 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.id);
    document.getElementById(tabId(idPrefix, target.id))?.focus();
  }

  return (
    <div ref={stripRef} className="yc-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((tab) => {
        const on = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            className={on ? 'yc-tab is-on' : 'yc-tab'}
            aria-selected={on}
            // Only the selected tab's panel is on the page: a reference to one
            // that is not is a broken link for a screen reader.
            {...(on ? { 'aria-controls': panelId(idPrefix, tab.id) } : {})}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined ? <span className="yc-tab-cnt">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
