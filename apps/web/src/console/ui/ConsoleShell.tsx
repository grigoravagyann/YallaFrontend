import { useTranslation } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { DevRoleSwitcher } from '../../auth/DevRoleSwitcher';
import { LockIcon, SignOutIcon } from './icons';
import { ToastProvider } from './toast';
import './console.css';
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
  /** The page. */
  readonly children: ReactNode;
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
 * No language picker here, in either console: it lives in Settings / My
 * account and on the sign-in page.
 */
export function ConsoleShell({ groups, place, person, onSignOut, children }: ConsoleShellProps) {
  const { t } = useTranslation(['admin', 'common']);
  const grouped = groups.some((group) => group.labelKey);

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
      <div className="yc yc-app">
        <a className="yc-skip" href={`#${MAIN_ID}`}>
          {t('shell.skipToContent')}
        </a>

        <div className={grouped ? 'yc-side is-grouped' : 'yc-side'}>
          <div className="yc-brand">
            <Wordmark />
            {grouped ? <span className="yc-brand-sub">{t('shell.brandSub')}</span> : null}
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

        <main className="yc-main" id={MAIN_ID} tabIndex={-1}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
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
