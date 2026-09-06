/**
 * How a menu item is addressed from elsewhere in the console.
 *
 * Two surfaces have to agree about this string and they are in different
 * folders: the reports screen writes the link, and the menu editor puts the id
 * on the row. Written twice they would drift on the first rename, and the
 * failure is silent — the link still goes to the menu, just not to the row, and
 * nobody files a bug about a link that "sort of works".
 *
 * The never-ordered list is the reason it matters. That report is the one thing
 * in the product that reliably changes what a venue does tomorrow, and it only
 * does so if acting on it is one tap rather than a hunt through sixty items.
 */
export function menuItemAnchorId(menuItemId: string): string {
  return `menu-item-${menuItemId}`;
}

export function menuItemHref(menuItemId: string): string {
  return `/venue/menu#${menuItemAnchorId(menuItemId)}`;
}

/** The item a `#menu-item-…` hash names, or null for any other hash. */
export function menuItemIdFromHash(hash: string): string | null {
  const prefix = `#${menuItemAnchorId('')}`;
  return hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
}
