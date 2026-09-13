/** "Lara Avagyan" → "LA"; a single name gives one letter; nothing gives "?". */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
  return letters || '?';
}
