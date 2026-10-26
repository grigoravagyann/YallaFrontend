/** The arrows' steps through the time grid: across a row, and down a column. */
export function gridStep(key: string, columns: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return 1;
    case 'ArrowLeft':
      return -1;
    case 'ArrowDown':
      return columns;
    case 'ArrowUp':
      return -columns;
    default:
      return null;
  }
}
