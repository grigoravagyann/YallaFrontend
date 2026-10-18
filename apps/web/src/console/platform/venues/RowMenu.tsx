import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon } from '../../ui/icons';

export interface RowMenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** Red, after a separator: the destructive item. */
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface RowMenuProps {
  /** "Actions for Sunset Lounge": names the button and the menu. */
  readonly label: string;
  readonly items: readonly RowMenuItem[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `data-kebab` on the button, so the list can hand the focus back to it. */
  readonly id: string;
}

/** Room left under the menu before it opens upward instead. */
const GAP = 4;

/**
 * A row's ⋮ menu: the WAI-ARIA menu button (HANDOFF section 4).
 *
 * Opening puts the focus on the first item; ArrowDown and ArrowUp move round
 * the items, Home and End jump to the ends; Escape closes and gives the focus
 * back to the button; Tab closes and lets the focus go on from the button. A
 * press anywhere else closes it.
 *
 * Portalled and fixed beside its button rather than positioned inside the
 * table cell: the table scrolls sideways on a phone, and a scrolling box clips
 * whatever hangs out of it — the last row's menu would open into nothing. It
 * opens upward when there is no room below, follows its button when the page
 * or the table scrolls, and closes once the button has scrolled out of sight.
 */
export function RowMenu({ label, items, open, onOpenChange, id }: RowMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [place, setPlace] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  /**
   * Under the button, right edges aligned; flipped above when it would run
   * off. False once the button is out of the viewport: nothing to hang from.
   */
  const placeBesideButton = useCallback((): boolean => {
    const button = buttonRef.current;
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0) return false;
    if (rect.left > window.innerWidth) return false;
    const right = Math.max(GAP, window.innerWidth - rect.right);
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP + height <= window.innerHeight;
    setPlace(
      below || rect.top < height
        ? { top: rect.bottom + GAP, right }
        : { bottom: window.innerHeight - rect.top + GAP, right },
    );
    return true;
  }, []);

  useLayoutEffect(() => {
    if (open) placeBesideButton();
  }, [open, placeBesideButton]);

  // The list passes a new callback on every render; keyed on it, the effect
  // below would re-run — and take the focus back to the first item — whenever
  // the list behind the menu refreshed.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  // Opening, and only opening, puts the focus on the first item.
  useEffect(() => {
    if (!open) return;
    // Without scrolling: the browser would otherwise scroll to an item it has
    // not finished placing.
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChangeRef.current(false);
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const scrolled = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (!placeBesideButton()) close();
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', scrolled);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', scrolled);
    };
  }, [open, placeBesideButton]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case 'ArrowDown':
        return go(at + 1);
      case 'ArrowUp':
        return go(at - 1);
      case 'Home':
        return go(0);
      case 'End':
        return go(all.length - 1);
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        buttonRef.current?.focus();
        return;
      case 'Tab':
        // Not prevented: the focus lands on the button, and Tab carries on from it.
        onOpenChange(false);
        buttonRef.current?.focus();
        return;
      default:
        return;
    }
  }

  const firstDanger = items.findIndex((item) => item.danger);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? 'yc-kebab is-open' : 'yc-kebab'}
        data-kebab={id}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        onClick={() => onOpenChange(!open)}
      >
        <MoreIcon />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="yc yc-menu"
              role="menu"
              aria-label={label}
              style={
                place
                  ? {
                      ...(place.top !== undefined ? { top: place.top } : {}),
                      ...(place.bottom !== undefined ? { bottom: place.bottom } : {}),
                      right: place.right,
                    }
                  : // Not `visibility: hidden`: a hidden item cannot take the focus.
                    { opacity: 0, top: 0, right: 0 }
              }
              onKeyDown={onMenuKey}
            >
              {items.map((item, index) => (
                <Fragment key={item.key}>
                  {index === firstDanger && index > 0 ? (
                    <div className="yc-menu-sep" role="separator" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={item.danger ? 'yc-menu-item is-danger' : 'yc-menu-item'}
                    onClick={() => {
                      onOpenChange(false);
                      item.onSelect();
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
