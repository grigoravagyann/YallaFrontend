import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuButtonItem {
  readonly id: string;
  readonly label: string;
  /** Said in words by the label; the colour only repeats it. */
  readonly tone?: 'danger';
  readonly onSelect: () => void;
}

export interface MenuButtonProps {
  /** The visible word on the trigger, e.g. "More". Never an icon on its own. */
  readonly label: string;
  /** Which thing the menu is for: "More actions for Ani Hakobyan". */
  readonly accessibleName: string;
  readonly items: readonly MenuButtonItem[];
}

/**
 * The WAI-ARIA menu button: a trigger and a list of actions it opens.
 *
 * Keys, per the pattern. On the trigger, Enter, Space and ArrowDown open on
 * the first item and ArrowUp on the last. In the menu, the arrows move with
 * wrap-around, Home and End jump, Escape closes and hands focus back to the
 * trigger, and Tab closes and lets focus move on. A press outside closes it.
 *
 * Renders nothing when there is nothing to put in it: an empty menu is a
 * control that promises something and delivers nothing.
 */
export function MenuButton({ label, accessibleName, items }: MenuButtonProps) {
  const [open, setOpen] = useState<'first' | 'last' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;
    const list = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    (open === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (items.length === 0) return null;

  function close() {
    setOpen(null);
    triggerRef.current?.focus();
  }

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen('last');
    }
  }

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    const list = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const at = list.findIndex((item) => item === document.activeElement);
    const move = (index: number) => list[(index + list.length) % list.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(at + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(at - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(list.length - 1);
        break;
      case 'Escape':
        // Not the dialog's Escape as well: this press was for the menu.
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        setOpen(null);
        break;
    }
  }

  return (
    <div className="overflow-menu-anchor" ref={wrapRef}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="button button-small button-ghost overflow-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? menuId : undefined}
        aria-label={accessibleName}
        onClick={() => setOpen((current) => (current ? null : 'first'))}
        onKeyDown={onTriggerKey}
      >
        {label}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className="overflow-menu"
          onKeyDown={onMenuKey}
        >
          {items.map((item, index) => (
            <li key={item.id} role="none">
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`overflow-menu-item${item.tone === 'danger' ? ' is-danger' : ''}`}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
