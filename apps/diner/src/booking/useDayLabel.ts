import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useMemo } from 'react';
import type { DayOption } from '../places/slots';

/** "Today", "Tomorrow", then "Sat 18" in the place's zone and the diner's language. */
export function useDayLabel(timeZoneId: string): (day: DayOption) => string {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const short = useMemo(
    () =>
      new Intl.DateTimeFormat(intlTag(locale), {
        weekday: 'short',
        day: 'numeric',
        timeZone: timeZoneId,
      }),
    [locale, timeZoneId],
  );
  return useCallback(
    (day: DayOption) =>
      day.isToday
        ? t('booking.today')
        : day.isTomorrow
          ? t('booking.tomorrow')
          : short.format(day.date),
    [short, t],
  );
}
