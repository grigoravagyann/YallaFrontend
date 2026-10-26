import type { PublicBranch } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { dayWords } from './dayNames';
import { bookingDays } from './slots';

/** The days: chips for the first week the window reaches, and "Other day…" for the rest. */
export function BookingDayChips({
  branch,
  today,
  calendarToday,
  shownDay,
  labelId,
  onPick,
}: {
  readonly branch: PublicBranch;
  /**
   * The branch's service day now: the first chip — "Today", or "Tonight" while
   * last night is still open past midnight.
   */
  readonly today: string;
  /** The branch's calendar day, which the words "Today" and "Tomorrow" are about. */
  readonly calendarToday: string;
  readonly shownDay: string;
  readonly labelId: string;
  readonly onPick: (date: string) => void;
}) {
  const { t } = useTranslation('public');
  const inputId = useId();
  const days = bookingDays(today, branch.bookingWindowDays);
  const onChip = days.chips.includes(shownDay);
  const [otherOpen, setOtherOpen] = useState(false);
  // A day past the chips — picked in the input, or the page's own default after
  // a shut week — keeps the input that shows it open.
  const showInput = days.more && (otherOpen || !onChip);

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.day')}
      </span>
      <div className="pub-days" role="group" aria-labelledby={labelId}>
        {days.chips.map((date) => {
          const words = dayWords(date, calendarToday, t, today);
          return (
            <button
              key={date}
              type="button"
              className="pub-day"
              aria-pressed={date === shownDay}
              // Holds every word the chip shows ("Today", "20"), WCAG 2.5.3.
              aria-label={words.full}
              onClick={() => {
                setOtherOpen(false);
                onPick(date);
              }}
            >
              <small>{words.name ?? words.weekday}</small>
              <b>{words.day}</b>
            </button>
          );
        })}
        {days.more ? (
          <button
            type="button"
            className={`pub-day pub-day-other${onChip ? '' : ' is-chosen'}`}
            aria-expanded={showInput}
            aria-controls={showInput ? inputId : undefined}
            onClick={() => setOtherOpen((open) => !open)}
          >
            {/* The day chosen here is said in words, not only drawn (review N7). */}
            {onChip
              ? t('booking.otherDay')
              : t('booking.otherDayChosen', {
                  date: dayWords(shownDay, calendarToday, t, today).date,
                })}
          </button>
        ) : null}
      </div>
      {showInput ? (
        <label className="pub-field pub-date-other" id={inputId}>
          <span>{t('booking.otherDate', { count: branch.bookingWindowDays })}</span>
          <input
            type="date"
            value={shownDay}
            min={today}
            max={days.last}
            onChange={(event) => onPick(event.currentTarget.value)}
          />
        </label>
      ) : null}
    </div>
  );
}
