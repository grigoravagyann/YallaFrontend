import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET,
  addDays,
  branchToday,
  daysInRange,
  everyDayIn,
  firstActiveDay,
  previousRange,
  problemWith,
  rangeFor,
} from './range';

/**
 * The range control, which decides what every number on the screen means.
 *
 * Two rules are worth more than the rest and both are tested here rather than
 * trusted: a range is in the **branch's** local dates, and a comparison is
 * against **the same number of days immediately before**. Get the first wrong
 * and a report labelled Tuesday is four hours of somebody else's Tuesday; get
 * the second wrong and every percentage on the page is a comparison against a
 * different-length period while looking like a like-for-like.
 */

// A Tuesday, so week boundaries are visible in both directions.
const TUESDAY = '2026-09-08';

describe('the default', () => {
  it('is last week', () => {
    // Not yesterday — one service, too noisy to conclude from. Not this month —
    // incomplete, and always a decline against a whole previous one.
    expect(DEFAULT_PRESET).toBe('lastWeek');
  });
});

describe('presets, resolved against a Tuesday', () => {
  it('yesterday is one day', () => {
    expect(rangeFor('yesterday', TUESDAY)).toEqual({ from: '2026-09-07', to: '2026-09-07' });
  });

  it('this week runs Monday to today, never into the future', () => {
    // A range that ran to Sunday would compare a part-week against a whole one
    // and read as a collapse every Monday morning.
    expect(rangeFor('thisWeek', TUESDAY)).toEqual({ from: '2026-09-07', to: TUESDAY });
  });

  it('last week is the whole Monday-to-Sunday before it', () => {
    expect(rangeFor('lastWeek', TUESDAY)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(daysInRange(rangeFor('lastWeek', TUESDAY)!)).toBe(7);
  });

  it('starts the week on Monday', () => {
    // Armenia's week. A Sunday-start week splits every weekend in half, and the
    // weekend is what the numbers are made of.
    const sunday = '2026-09-13';
    expect(rangeFor('thisWeek', sunday)?.from).toBe('2026-09-07');

    const monday = '2026-09-07';
    expect(rangeFor('thisWeek', monday)).toEqual({ from: monday, to: monday });
  });

  it('this month runs from the 1st to today', () => {
    expect(rangeFor('thisMonth', TUESDAY)).toEqual({ from: '2026-09-01', to: TUESDAY });
  });

  it('last month is the whole calendar month', () => {
    expect(rangeFor('lastMonth', TUESDAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('gets February right in a leap year and out of one', () => {
    expect(rangeFor('lastMonth', '2028-03-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(rangeFor('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('leaves custom to the two date inputs', () => {
    // Null rather than a guess, so switching to Custom keeps the dates already
    // on screen instead of snapping them somewhere the owner did not choose.
    expect(rangeFor('custom', TUESDAY)).toBeNull();
  });
});

describe('the comparison period', () => {
  it('is the same length, ending the day before', () => {
    expect(previousRange({ from: '2026-08-31', to: '2026-09-06' })).toEqual({
      from: '2026-08-24',
      to: '2026-08-30',
    });
  });

  it('counts days rather than calendar months', () => {
    /*
     * A 31-day August compares against the 31 days before it, which reach back
     * into July — not against February. A different-length period would be
     * worse than no comparison at all, because it looks like a like-for-like.
     */
    const august = { from: '2026-08-01', to: '2026-08-31' };
    const before = previousRange(august);
    expect(daysInRange(before)).toBe(daysInRange(august));
    expect(before).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('holds for a single day', () => {
    expect(previousRange({ from: '2026-09-07', to: '2026-09-07' })).toEqual({
      from: '2026-09-06',
      to: '2026-09-06',
    });
  });
});

describe('local dates are the branch’s, not the device’s', () => {
  it('reads the day from the branch zone', () => {
    // 21:00 UTC on the 7th is already the 8th in Yerevan (UTC+4). A report run
    // at that moment for "yesterday" must mean the 7th, whatever the laptop
    // running the console is set to.
    const instant = new Date('2026-09-07T21:00:00Z');
    expect(branchToday('Asia/Yerevan', instant)).toBe('2026-09-08');
    expect(branchToday('Europe/London', instant)).toBe('2026-09-07');
  });

  it('does not shift a date key across a daylight-saving boundary', () => {
    // The keys are days, not instants, so the arithmetic cannot lose an hour.
    // London springs forward on 2026-03-29.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('a range the server will refuse', () => {
  it('names a backwards range before asking', () => {
    expect(problemWith({ from: '2026-09-08', to: '2026-09-01' })).toBe('backwards');
  });

  it('names an over-long one', () => {
    // 366 is the server's cap and is allowed; 367 is not.
    expect(problemWith({ from: '2026-01-01', to: '2027-01-01' })).toBeNull();
    expect(problemWith({ from: '2026-01-01', to: '2027-01-02' })).toBe('tooLong');
  });

  it('passes an ordinary range', () => {
    expect(problemWith({ from: '2026-08-31', to: '2026-09-06' })).toBeNull();
  });
});

describe('a branch that only went live mid-range', () => {
  const RANGE = { from: '2026-08-01', to: '2026-08-05' };
  const day = (localDate: string, revenueAmd: number) => ({ localDate, revenueAmd, tabs: 1 });

  /*
   * `byDay` is **sparse**. The server groups the tabs that closed, so a quiet
   * day has no row at all — which is why this compares against the range rather
   * than looking for leading zero rows. The first version did the latter, and
   * the contract suite's live run is what proved it wrong: the mock had been
   * sending a dense series and agreeing with the mistake.
   */
  it('reports the first day anything was recorded', () => {
    expect(firstActiveDay(RANGE, [day('2026-08-03', 90_000), day('2026-08-04', 80_000)])).toBe(
      '2026-08-03',
    );
  });

  it('says nothing when the range was trading from its first day', () => {
    expect(
      firstActiveDay(RANGE, [day('2026-08-01', 90_000), day('2026-08-02', 80_000)]),
    ).toBeNull();
  });

  it('says nothing for a range with no activity at all', () => {
    // That is the empty state's job, and two explanations of one blank screen
    // is one more than anybody reads.
    expect(firstActiveDay(RANGE, [])).toBeNull();
  });

  it('is not fooled by rows arriving out of order', () => {
    expect(firstActiveDay(RANGE, [day('2026-08-04', 10), day('2026-08-02', 10)])).toBe(
      '2026-08-02',
    );
  });
});

describe('filling the gaps in a sparse series', () => {
  const day = (localDate: string, revenueAmd: number) => ({ localDate, revenueAmd, tabs: 1 });

  it('gives every day in the range a point', () => {
    // A line chart plotted off the sparse series draws a straight slope across
    // the days the venue was shut, which reads as steady trade through them.
    const filled = everyDayIn({ from: '2026-08-01', to: '2026-08-05' }, [
      day('2026-08-03', 90_000),
    ]);

    expect(filled.map((entry) => entry.localDate)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(filled.map((entry) => entry.revenueAmd)).toEqual([0, 0, 90_000, 0, 0]);
    expect(filled.map((entry) => entry.tabs)).toEqual([0, 0, 1, 0, 0]);
  });

  it('leaves a dense series alone', () => {
    const dense = [day('2026-08-01', 10), day('2026-08-02', 20)];
    expect(everyDayIn({ from: '2026-08-01', to: '2026-08-02' }, dense)).toEqual(dense);
  });
});
