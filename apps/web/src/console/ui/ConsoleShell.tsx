import { useTranslation } from '@yalla/i18n';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DevRoleSwitcher } from '../../auth/DevRoleSwitcher';
import { useDialogFocus } from '../../components/useDialogFocus';
import { CrossIcon, DrawerIcon, LockIcon, MapPinIcon, SignOutIcon } from './icons';
import { usePhoneLayout } from './phoneLayout';
import { ToastProvider } from './toast';
import './console.css';
import './phone-shell.css';
import { Wordmark } from '../../components/Wordmark';

/** One destination in the sidebar. */
export interface ShellLink {
  readonly to: string;
  /** Key in the `admin` namespace. */
  readonly labelKey: string;
  readonly icon: ReactNode;
  /** Matches only itself, not every page under it. */
  readonly end?: boolean;
  /**
   * A live count beside the label (the venue console's pending approvals,
   * unfinished dishes and reported reviews). Drawn only above zero, and only
   * once the count is known: a count that could not be read is no badge, never
   * a zero. `sayKey` is the plural sentence a screen reader hears instead of
   * the bare number.
   */
  readonly badge?: { readonly count: number; readonly sayKey: string } | null | undefined;
  /**
   * The platform has not enabled the page's feature at this branch
   * (2026-10-27): the link stays — locked, not hidden — with a lock and the
   * reason for the ear; the page says the rest.
   */
  readonly locked?: boolean | undefined;
}

/** Links under one heading. The platform's three links have none. */
export interface ShellGroup {
  readonly id: string;
  /** Key in the `admin` namespace; absent for an ungrouped list. */
  readonly labelKey?: string;
  readonly links: readonly ShellLink[];
}

/** Who is signed in, at the sidebar's foot. */
export interface ShellPerson {
  readonly name: string;
  /** The line under the name: the role, or "My account" where the block opens it. */
  readonly caption: string;
  /** Where the block leads: the person's own account page. Absent, it is not a link. */
  readonly accountTo?: string | undefined;
}

export interface ConsoleShellProps {
  readonly groups: readonly ShellGroup[];
  /** Between the brand and the links: the venue console's venue and branch panel. */
  readonly place?: ReactNode;
  readonly person: ShellPerson;
  /** A sign-out button beside the person. Absent where sign-out lives elsewhere. */
  readonly onSignOut?: (() => void) | undefined;
  /**
   * The branch on screen, as a chip in the phone's top bar. `switchable` when
   * `place` holds a switcher (marked `data-drawer-focus="branch"`): the chip
   * then opens the drawer on it.
   */
  readonly barChip?: { readonly label: string; readonly switchable: boolean } | null | undefined;
  /** The page. */
  readonly children: ReactNode;
}

/** Where the focus lands when the drawer opens, by what opened it. */
const BRANCH_FOCUS = '[data-drawer-focus="branch"]';
const PERSON_FOCUS = '.yc-side-foot .yc-me-link, .yc-side-foot .yc-out';

interface ShellDrawer {
  /** Closes the phone's drawer; nothing on a desktop. */
  readonly close: () => void;
}

const ShellDrawerContext = createContext<ShellDrawer>({ close: () => undefined });

/**
 * For a control inside the sidebar that changes what the page shows without
 * navigating (the branch switcher): the drawer closes, so the page is seen.
 */
export function useShellDrawer(): ShellDrawer {
  return useContext(ShellDrawerContext);
}

const MAIN_ID = 'main';

/** Up to two initials from a name: "Grigor Avagyan" → "GA". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/**
 * The one console shell: the dark-brown sidebar and the page in a `main`
 * beside it, with the toast every page under it can say.
 *
 * Both consoles are built from it (venue HANDOFF: "build the shell once").
 * The platform admin's has three links and no headings
 * (docs/design/console); the venue console's has four headed groups with live
 * counts, the venue and its branch under the brand, and the person at the
 * foot opening their account (docs/design/venue-console). What differs is
 * data handed in, not a second sidebar: a grouped list draws the venue
 * artboards' wider, tighter measures.
 *
 * On a phone (`PHONE_QUERY`, 2026-10-27) the same sidebar is a drawer from the
 * left, behind a sticky top bar: the menu button (with a dot when a link has a
 * count), the wordmark, the branch chip and the avatar. Everything the desktop
 * sidebar holds is in it, because it is the sidebar. Open, it is a modal
 * dialog: the focus stays inside, Escape or a tap on the scrim closes it, and
 * so does any navigation.
 *
 * No language picker here, in either console: it lives in Settings / My
 * account and on the sign-in page.
 */
export function ConsoleShell({
  groups,
  place,
  person,
  onSignOut,
  barChip,
  children,
}: ConsoleShellProps) {
  const { t } = useTranslation(['admin', 'common']);
  const grouped = groups.some((group) => group.labelKey);
  const { pathname } = useLocation();
  const phone = usePhoneLayout();
  const sideId = useId();
  const sideRef = useRef<HTMLDivElement>(null);

  /**
   * The drawer: where the focus goes in it and what opened it, or closed. The
   * opener is held from the tap: the bar turns inert while the drawer is open,
   * and an inert control loses the focus a dialog would hand back.
   */
  const [drawer, setDrawer] = useState<{
    readonly focus: string | null;
    readonly opener: HTMLElement;
  } | null>(null);
  // Any navigation closes it, and so does leaving the phone layout (a turned
  // tablet): a drawer left open there would leave the page inert.
  const [shownAt, setShownAt] = useState({ pathname, phone });
  if (shownAt.pathname !== pathname || shownAt.phone !== phone) {
    setShownAt({ pathname, phone });
    if (drawer) setDrawer(null);
  }
  const open = phone && drawer !== null;
  const close = () => setDrawer(null);
  const attention = groups.some((group) =>
    group.links.some((link) => (link.badge?.count ?? 0) > 0),
  );

  const me = (
    <>
      <span className="yc-avatar" aria-hidden="true">
        {initialsOf(person.name)}
      </span>
      <span className="yc-me-t">
        <span className="yc-me-n">{person.name}</span>
        <span className="yc-me-r">{person.caption}</span>
      </span>
    </>
  );

  return (
    <ToastProvider>
      <ShellDrawerContext.Provider value={{ close }}>
        <div className="yc yc-app">
          <a className="yc-skip" href={`#${MAIN_ID}`}>
            {t('shell.skipToContent')}
          </a>

          {/* The phone's top bar; not drawn on a desktop. */}
          <header className="yc-topbar" inert={open}>
            <button
              type="button"
              className="yc-tb-btn"
              aria-expanded={open}
              aria-controls={sideId}
              aria-label={attention ? t('shell.openMenuAttention') : t('shell.openMenu')}
              onClick={(event) => setDrawer({ focus: null, opener: event.currentTarget })}
            >
              <DrawerIcon />
              {attention ? <span className="yc-tb-dot" aria-hidden="true" /> : null}
            </button>
            <span className="yc-tb-brand">
              <Wordmark />
            </span>
            {barChip ? (
              barChip.switchable ? (
                <button
                  type="button"
                  className="yc-tb-chip"
                  aria-label={t('shell.changeBranch', { name: barChip.label })}
                  onClick={(event) =>
                    setDrawer({ focus: BRANCH_FOCUS, opener: event.currentTarget })
                  }
                >
                  <span className="yc-tb-chip-in">
                    <MapPinIcon />
                    <span className="yc-tb-chip-t">{barChip.label}</span>
                  </span>
                </button>
              ) : (
                <span className="yc-tb-chip">
                  <span className="yc-tb-chip-in">
                    <MapPinIcon />
                    <span className="yc-sr">{t('branchSwitcher.label')} </span>
                    <span className="yc-tb-chip-t">{barChip.label}</span>
                  </span>
                </span>
              )
            ) : null}
            <button
              type="button"
              className="yc-tb-me"
              aria-label={t('shell.person', { name: person.name })}
              onClick={(event) => setDrawer({ focus: PERSON_FOCUS, opener: event.currentTarget })}
            >
              <span className="yc-avatar" aria-hidden="true">
                {initialsOf(person.name)}
              </span>
            </button>
          </header>

          {open ? (
            <>
              <div className="yc-scrim" data-testid="drawer-scrim" onClick={close} />
              <DrawerFocus
                container={sideRef}
                focus={drawer.focus}
                opener={drawer.opener}
                onClose={close}
              />
            </>
          ) : null}

          <div
            ref={sideRef}
            id={sideId}
            className={['yc-side', grouped ? 'is-grouped' : '', open ? 'is-open' : '']
              .filter(Boolean)
              .join(' ')}
            {...(open
              ? { role: 'dialog', 'aria-modal': true, 'aria-label': t('shell.drawer') }
              : {})}
            onClick={(event) => {
              // A link followed from the drawer: the page it opens is what to see.
              if (open && event.target instanceof Element && event.target.closest('a')) close();
            }}
          >
            <div className="yc-brand">
              <Wordmark />
              {grouped ? <span className="yc-brand-sub">{t('shell.brandSub')}</span> : null}
              <button
                type="button"
                className="yc-drawer-x"
                aria-label={t('shell.closeMenu')}
                onClick={close}
              >
                <CrossIcon />
              </button>
            </div>

            {place}

            <nav className="yc-nav" aria-label={t('shell.mainNav')}>
              {groups.map((group) =>
                group.labelKey ? (
                  <NavGroup key={group.id} labelKey={group.labelKey} links={group.links} />
                ) : (
                  group.links.map((link) => <ShellNavLink key={link.to} link={link} />)
                ),
              )}
            </nav>

            <div className="yc-side-foot">
              <DevRoleSwitcher />
              {person.accountTo ? (
                <NavLink className="yc-me yc-me-link" to={person.accountTo} end>
                  {me}
                </NavLink>
              ) : (
                <div className="yc-me">
                  {me}
                  {onSignOut ? (
                    <button
                      type="button"
                      className="yc-out"
                      aria-label={t('shell.signOut')}
                      title={t('shell.signOut')}
                      onClick={onSignOut}
                    >
                      <SignOutIcon />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <main className="yc-main" id={MAIN_ID} tabIndex={-1} inert={open}>
            {children}
          </main>
        </div>
      </ShellDrawerContext.Provider>
    </ToastProvider>
  );
}

/**
 * The open drawer's focus: in on open (to `focus`, or the close button), held
 * inside, Escape closes, and back to whatever opened it on close.
 */
function DrawerFocus({
  container,
  focus,
  opener,
  onClose,
}: {
  readonly container: RefObject<HTMLDivElement | null>;
  readonly focus: string | null;
  readonly opener: HTMLElement;
  readonly onClose: () => void;
}) {
  useDialogFocus(container, { onEscape: onClose, returnFocusTo: () => opener });
  useEffect(() => {
    if (focus) container.current?.querySelector<HTMLElement>(focus)?.focus();
  }, [container, focus]);
  return null;
}

function NavGroup({ labelKey, links }: { labelKey: string; links: readonly ShellLink[] }) {
  const { t } = useTranslation(['admin', 'common']);
  const headingId = useId();
  return (
    <div className="yc-ngrp" role="group" aria-labelledby={headingId}>
      <span className="yc-ngroup" id={headingId}>
        {t(labelKey)}
      </span>
      {links.map((link) => (
        <ShellNavLink key={link.to} link={link} />
      ))}
    </div>
  );
}

function ShellNavLink({ link }: { link: ShellLink }) {
  const { t } = useTranslation(['admin', 'common']);
  const count = link.badge?.count ?? 0;
  return (
    <NavLink
      to={link.to}
      end={link.end ?? false}
      {...(link.locked ? { className: 'is-locked' } : {})}
    >
      {link.icon}
      {t(link.labelKey)}
      {link.locked ? (
        <>
          <LockIcon className="yc-i yc-nlock" />
          <span className="yc-sr">, {t('featureLocked.nav')}</span>
        </>
      ) : null}
      {link.badge && count > 0 ? (
        <>
          {/* The number for the eye; the sentence for the ear, said once. */}
          <span className="yc-nbadge" aria-hidden="true">
            {count}
          </span>
          <span className="yc-sr">{t(link.badge.sayKey, { count })}</span>
        </>
      ) : null}
    </NavLink>
  );
}
