import { useLocale, useTranslation } from '@yalla/i18n';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Wordmark } from '../../components/Wordmark';
import type { ChipTone } from '../StaffHeader';
import './phone.css';

/** The phone's screens with a tab of their own (staff phone, the bottom tabs). */
export type PhoneTab = 'today' | 'now' | 'floor' | 'messages' | 'takeaway' | 'more';

export interface PhoneTabSpec {
  readonly key: PhoneTab;
  /** Waiting for somebody here: the badge on the tab, and said in its name. */
  readonly count?: number | undefined;
}

export interface PhoneShellProps {
  /** The screen's name: the page's heading, for a screen reader; the tab says it on screen. */
  readonly title: string;
  /** "Lumen · Lumen North". */
  readonly place: string;
  /** Whose session is open; empty on a build with none. */
  readonly who: string;
  /** The connection chip's words and tone, as the tablet's bar has them. */
  readonly chip: { readonly text: string; readonly tone: ChipTone };
  /** The chip's accessible name: what it says and that tapping refreshes. */
  readonly chipLabel: string;
  readonly onRefresh: () => void;
  /** Refused or held commands: shown until there are none, as on the tablet. */
  readonly conflicts: number;
  readonly onOpenConflicts: () => void;
  readonly tabs: readonly PhoneTabSpec[];
  /** The tab on show; `null` on a screen opened from one (Approve). */
  readonly current: PhoneTab | null;
  readonly onTab: (tab: PhoneTab) => void;
  /** A screen opened from a tab: its bar has Back and its own heading instead of the brand. */
  readonly back?: { readonly onBack: () => void } | undefined;
  /** The foot-of-screen notice and the screen-reader announcers, as on the tablet. */
  readonly notice?: ReactNode;
  readonly announcers?: ReactNode;
  /** The table's bottom sheet: while it is up, everything under it is inert. */
  readonly sheet?: ReactNode;
  readonly onCloseSheet?: (() => void) | undefined;
  /** Order entry, the tab, the conflicts: full screen, over everything. */
  readonly overlays?: ReactNode;
  readonly children: ReactNode;
}

/**
 * The staff phone (staff phone spec, "Phone layout for /staff"): the cherry
 * bar — the wordmark, where, whether it is live, whose phone — the screen,
 * and the bottom tabs: Now / Floor / Messages / Takeaway / More, a manager's
 * Today first.
 *
 * Only the frame. Every screen in it is the floor tablet's own code, given
 * by `FloorRoute`, so a table seated or a booking approved on a phone is the
 * same command, queue and notice as on the counter.
 *
 * Sized for one thumb: every target at least 44×44, the tabs 72px tall over
 * the home indicator (`env(safe-area-inset-bottom)`), the bar under the
 * notch (`env(safe-area-inset-top)`).
 */
export function PhoneShell(props: PhoneShellProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const sheetOpen = Boolean(props.sheet);
  const sub = Boolean(props.back);
  const subTitle = useRef<HTMLHeadingElement>(null);
  /** What had focus when a screen was opened from a tab: it gets it back on Back. */
  const opener = useRef<HTMLElement | null>(null);
  // Layout, not passive: the row that opened the screen still has focus here,
  // before the browser notices it was hidden.
  useLayoutEffect(() => {
    if (sub) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      subTitle.current?.focus();
      return;
    }
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus();
  }, [sub]);
  const initials = props.who
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase(locale))
    .join('');

  return (
    <div className="floor ph" data-surface="staff" data-layout="phone">
      {/* `inert` under the sheet: a modal sheet, so a stray thumb on the floor
          behind it does nothing, and Tab stays inside it. */}
      <div className="ph-frame" inert={sheetOpen ? true : undefined}>
        {props.back ? (
          <header className="ph-top is-sub">
            <button
              type="button"
              className="ph-back"
              aria-label={t('phone.back')}
              onClick={props.back.onBack}
            >
              <PhoneIcon name="back" />
            </button>
            <h1 className="ph-sub-title" tabIndex={-1} ref={subTitle}>
              {props.title}
            </h1>
          </header>
        ) : (
          <header className="ph-top">
            <span className="ph-brand">
              <Wordmark />
            </span>
            {/* Where, and whether it can be trusted: one tap refreshes, as the
                tablet's chip does. */}
            <button
              type="button"
              className="ph-where"
              aria-label={props.chipLabel}
              onClick={props.onRefresh}
            >
              <b>{props.place}</b>
              <span className={`ph-live is-${props.chip.tone}`}>
                <i aria-hidden="true" />
                {props.chip.text}
              </span>
            </button>
            {props.who ? (
              <button
                type="button"
                className="ph-avatar"
                aria-label={t('phone.myPage', { name: props.who })}
                aria-current={props.current === 'more' ? 'page' : undefined}
                onClick={() => props.onTab('more')}
              >
                <span aria-hidden="true">{initials}</span>
              </button>
            ) : null}
          </header>
        )}

        {/* A conflict that stops being visible is a decision nobody made. */}
        {props.conflicts > 0 ? (
          <button type="button" className="ph-conflicts" onClick={props.onOpenConflicts}>
            <PhoneIcon name="alert" />
            {t('queue.conflicts', { count: props.conflicts })}
          </button>
        ) : null}

        <main className="ph-main" data-screen={props.current ?? 'sub'}>
          {/* Today and More show their name as their own first heading. */}
          {props.back || props.current === 'today' || props.current === 'more' ? null : (
            <h1 className="visually-hidden">{props.title}</h1>
          )}
          {props.children}
        </main>

        {props.back ? null : (
          <nav className="ph-tabs" aria-label={t('phone.tabs.label')}>
            {props.tabs.map((tab) => {
              const label = t(`phone.tabs.${tab.key}`);
              const count = tab.count ?? 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className="ph-tab"
                  aria-current={props.current === tab.key ? 'page' : undefined}
                  aria-label={count > 0 ? t('phone.tabs.waiting', { name: label, count }) : label}
                  onClick={() => props.onTab(tab.key)}
                >
                  <PhoneIcon name={tab.key} />
                  <span aria-hidden="true">{label}</span>
                  {count > 0 ? (
                    <i className="ph-tab-count" aria-hidden="true">
                      {count > 99 ? '99+' : count}
                    </i>
                  ) : null}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {props.notice}
      {props.announcers}

      {props.sheet ? (
        <div className="ph-sheet-layer">
          {/* The scrim closes the sheet for a pointer; Escape and the sheet's
              own close button do it for everybody else. */}
          <div className="ph-scrim" aria-hidden="true" onClick={props.onCloseSheet} />
          {props.sheet}
        </div>
      ) : null}

      {props.overlays}
    </div>
  );
}

type IconName = PhoneTab | 'back' | 'alert' | 'chevron';

/** The artboards' tab and bar icons (Lucide shapes). */
export function PhoneIcon({ name }: { readonly name: IconName }) {
  return (
    <svg
      className="ft-icon ph-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<IconName, ReactNode> = {
  today: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  now: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  floor: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  messages: <path d="M4 5h16v11H9l-5 4z" />,
  takeaway: (
    <>
      <path d="M6 8h12l-1 12H7z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  back: <path d="m15 5-7 7 7 7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
};
