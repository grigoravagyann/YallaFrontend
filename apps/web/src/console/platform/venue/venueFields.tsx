import type { VenueType } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The artboard's order: a restaurant is the common case. */
export const VENUE_TYPES: readonly VenueType[] = ['restaurant', 'cafe', 'bar'];

/** "Cafe", "Restaurant", "Bar", from literal keys `i18n:check` can read. */
export function useVenueTypeLabel() {
  const { t } = useTranslation(['admin', 'common']);
  return useCallback(
    (type: VenueType) =>
      type === 'cafe'
        ? t('create.typeCafe')
        : type === 'restaurant'
          ? t('create.typeRestaurant')
          : t('create.typeBar'),
    [t],
  );
}

/** The red star after a required field's label, and the word for a screen reader. */
export function Required() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <>
      <span className="yc-req" aria-hidden="true">
        *
      </span>
      <span className="yc-sr">{t('venues.add.requiredMark')}</span>
    </>
  );
}

/**
 * Focus an element by id once the render that shows it has happened — the
 * error under a field, the next step's first field (HANDOFF section 4: the
 * cursor goes to the first invalid field).
 */
export function usePendingFocus(): (id: string) => void {
  const pending = useRef<string | null>(null);
  const [, rerender] = useState(0);
  useEffect(() => {
    const id = pending.current;
    if (!id) return;
    pending.current = null;
    document.getElementById(id)?.focus();
  });
  return useCallback((id: string) => {
    pending.current = id;
    rerender((n) => n + 1);
  }, []);
}

/** The map pin's one error, or `null`: both numbers, numbers, and on the globe. */
export function pinProblem(
  latitude: string,
  longitude: string,
  t: (key: string) => string,
): string | null {
  const lat = latitude.trim();
  const lng = longitude.trim();
  if (!lat || !lng) return t('venues.add.error.pinRequired');
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng)))
    return t('venues.add.error.pinNumber');
  if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
    return t('venues.add.error.pinRange');
  }
  return null;
}
