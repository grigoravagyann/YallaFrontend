import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  dayPartOf,
  defaultChoice,
  type DayPart,
  type SlotSelection,
  type TimeChoice,
} from './slots';
import { gridStep } from './timeGrid';

/** The day's times as chips, by half of the day when it is long, arrow keys through the grid. */
export function TimeChips({
  choices,
  selection,
  pending,
  shownDay,
  isToday,
  split,
  preferredPart,
  unchecked,
  labelId,
  onPick,
  onPart,
}: {
  readonly choices: readonly TimeChoice[];
  readonly selection: SlotSelection;
  /** A tapped day whose answer is on its way: its times are shown, none chosen yet. */
  readonly pending: boolean;
  readonly shownDay: string;
  readonly isToday: boolean;
  readonly split: boolean;
  readonly preferredPart: DayPart;
  /** The day's read failed: the times are the published hours, unchecked. */
  readonly unchecked: boolean;
  readonly labelId: string;
  readonly onPick: (choice: TimeChoice) => void;
  /** The visitor switched to a half of the day. */
  readonly onPart: (part: DayPart) => void;
}) {
  const { t } = useTranslation('public');
  const grid = useRef<HTMLDivElement>(null);
  /** The part the visitor switched to, on that day; otherwise the time's own. */
  const [partFor, setPartFor] = useState<{ readonly date: string; readonly part: DayPart } | null>(
    null,
  );

  const part =
    partFor && partFor.date === shownDay
      ? partFor.part
      : pending
        ? preferredPart
        : dayPartOf(selection.time);
  const shown = split ? choices.filter((choice) => dayPartOf(choice.time) === part) : choices;
  const isChosen = (choice: TimeChoice) =>
    !pending &&
    choice.state !== 'busy' &&
    choice.date === selection.date &&
    choice.time === selection.time;

  const pickPart = (next: DayPart) => {
    setPartFor({ date: shownDay, part: next });
    onPart(next);
    // Within the half asked for only: a switch to the evening is not answered
    // with a time in the afternoon.
    const first = defaultChoice(choices.filter((choice) => dayPartOf(choice.time) === next));
    if (first) onPick(first);
  };

  /*
   * One tab stop for the whole grid, the chosen time (or the first that can be
   * had), and the arrows move through it — thirty-odd chips are otherwise
   * thirty-odd presses of Tab between the party and the table (review N8).
   */
  const stop = Math.max(
    0,
    shown.findIndex(isChosen) >= 0
      ? shown.findIndex(isChosen)
      : shown.findIndex((choice) => choice.state !== 'busy'),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const node = grid.current;
    if (!node) return;
    const columns =
      getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    const step = gridStep(event.key, columns);
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? shown.length - 1
          : step === null
            ? null
            : index + step;
    if (target === null || target < 0 || target >= shown.length) return;
    event.preventDefault();
    node.querySelectorAll<HTMLButtonElement>('button')[target]?.focus();
  };

  const empty =
    choices.length === 0
      ? t('booking.noTimesLeft', { ns: 'diner' })
      : part === 'day'
        ? t(isToday ? 'booking.noTimes.dayToday' : 'booking.noTimes.day')
        : t('booking.noTimes.evening');

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.time', { ns: 'diner' })}
      </span>
      {split ? (
        <div className="pub-seg" role="group" aria-label={t('booking.dayParts')}>
          {(['day', 'evening'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={part === value}
              onClick={() => pickPart(value)}
            >
              {t(`booking.dayPart.${value}`)}
            </button>
          ))}
        </div>
      ) : null}
      {unchecked ? <p className="pub-notice">{t('booking.timesUnchecked')}</p> : null}
      {shown.length > 0 ? (
        <div
          className="pub-times"
          role="group"
          aria-labelledby={labelId}
          aria-busy={pending || undefined}
          ref={grid}
        >
          {shown.map((choice, index) => {
            const full = choice.state === 'busy';
            const onRequest = !full && choice.confirmsAtOnce === false;
            return (
              <button
                key={`${choice.date} ${choice.time}`}
                type="button"
                className={`pub-time${full ? ' is-full' : ''}`}
                aria-pressed={isChosen(choice)}
                aria-disabled={full || undefined}
                aria-label={
                  full
                    ? t('book.slotFull', { ns: 'diner', time: choice.time })
                    : onRequest
                      ? t('booking.timeOnRequest', { time: choice.time })
                      : undefined
                }
                tabIndex={index === stop ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  if (!full) onPick(choice);
                }}
              >
                {choice.time}
                {onRequest ? <small>{t('booking.onRequest')}</small> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="pub-empty">{empty}</p>
      )}
    </div>
  );
}
