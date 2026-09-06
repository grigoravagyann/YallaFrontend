import {
  WEEK_ORDER,
  blockMinutes,
  closesNextDay,
  toMinutes,
  type HoursBlock,
  type HoursDay,
  type WeekdayIndex,
  type WeeklyHours,
} from '@yalla/api';

/**
 * The week, as the screen edits it.
 *
 * Pure, and separate from the screen for the same reason the floor plan
 * editor's reducer is: this is where "closes next day" is decided, and getting
 * that wrong means a bar that shuts at one in the morning is recorded as
 * shutting at one in the afternoon — a venue that is closed for fourteen hours
 * a day according to every availability query the product makes.
 *
 * Three rules that are not obvious and each cost something to get wrong:
 *
 * 1. **`closesNextDay` is derived, never asked.** The server computes it from
 *    the two times and refuses to accept it from a client. A checkbox for it is
 *    a checkbox somebody ticks on the wrong row.
 * 2. **A closed day emits no interval.** Not a zero-length one. `00:00–00:00`
 *    looks like "shut" and reads to every consumer as a venue open for an
 *    instant at midnight.
 * 3. **The whole week is replaced at once**, so this is a draft with a dirty
 *    flag rather than per-row autosave. A PUT driven from a field's blur means
 *    the last blur silently wins over everything typed before it.
 */

export interface HoursState {
  /** The week as last loaded or last saved. What "discard" goes back to. */
  readonly saved: WeeklyHours;
  readonly draft: WeeklyHours;
}

export type HoursAction =
  | { readonly type: 'loaded'; readonly week: WeeklyHours }
  | {
      readonly type: 'setTime';
      readonly day: WeekdayIndex;
      readonly index: number;
      readonly field: 'opensAt' | 'closesAt';
      readonly value: string;
    }
  /** Shut for the day: the blocks go, and are remembered nowhere. */
  | { readonly type: 'setClosed'; readonly day: WeekdayIndex; readonly closed: boolean }
  /** A second span, for a venue that shuts between lunch and dinner. */
  | { readonly type: 'addBlock'; readonly day: WeekdayIndex }
  | { readonly type: 'removeBlock'; readonly day: WeekdayIndex; readonly index: number }
  /** One day's spans onto others. Most venues have two patterns, not seven. */
  | { readonly type: 'copyDay'; readonly from: WeekdayIndex; readonly to: readonly WeekdayIndex[] }
  | { readonly type: 'discard' };

/** What a day gets when it is opened, so a new row is never blank. */
const DEFAULT_BLOCK: HoursBlock = { opensAt: '09:00', closesAt: '23:00' };

export function initialHoursState(week: WeeklyHours = emptyWeek()): HoursState {
  return { saved: week, draft: week };
}

/** Seven closed days, for the moment before the server answers. */
export function emptyWeek(): WeeklyHours {
  return WEEK_ORDER.map((day) => ({ day, blocks: [] }));
}

export function hoursReducer(state: HoursState, action: HoursAction): HoursState {
  switch (action.type) {
    case 'loaded':
      // Replaces both. A load that kept a draft would silently reapply edits on
      // top of somebody else's saved week.
      return { saved: action.week, draft: action.week };

    case 'setTime':
      return {
        ...state,
        draft: mapDay(state.draft, action.day, (day) => ({
          ...day,
          blocks: day.blocks.map((block, index) =>
            index === action.index ? { ...block, [action.field]: action.value } : block,
          ),
        })),
      };

    case 'setClosed':
      return {
        ...state,
        draft: mapDay(state.draft, action.day, (day) => ({
          ...day,
          // Closed is an empty block list, held once. A `closed` flag beside a
          // list of blocks is two facts that can disagree, and the one that
          // reaches the server would be the list.
          blocks: action.closed ? [] : day.blocks.length > 0 ? day.blocks : [DEFAULT_BLOCK],
        })),
      };

    case 'addBlock':
      return {
        ...state,
        draft: mapDay(state.draft, action.day, (day) => ({
          ...day,
          blocks: [...day.blocks, nextBlockAfter(day.blocks)],
        })),
      };

    case 'removeBlock':
      return {
        ...state,
        draft: mapDay(state.draft, action.day, (day) => ({
          ...day,
          blocks: day.blocks.filter((_, index) => index !== action.index),
        })),
      };

    case 'copyDay': {
      const source = state.draft.find((day) => day.day === action.from);
      if (!source) return state;
      const targets = new Set(action.to);
      return {
        ...state,
        draft: state.draft.map((day) =>
          targets.has(day.day) && day.day !== action.from
            ? // Copied by value, not shared: editing Tuesday afterwards must not
              // silently edit Monday too.
              { ...day, blocks: source.blocks.map((block) => ({ ...block })) }
            : day,
        ),
      };
    }

    case 'discard':
      return { ...state, draft: state.saved };

    default:
      return state;
  }
}

function mapDay(
  week: WeeklyHours,
  day: WeekdayIndex,
  change: (day: HoursDay) => HoursDay,
): WeeklyHours {
  return week.map((candidate) => (candidate.day === day ? change(candidate) : candidate));
}

/** A second span starting an hour after the last one ends, so it never clashes. */
function nextBlockAfter(blocks: readonly HoursBlock[]): HoursBlock {
  const last = blocks[blocks.length - 1];
  if (!last) return DEFAULT_BLOCK;
  const closes = toMinutes(last.closesAt);
  if (closes < 0) return DEFAULT_BLOCK;
  const start = (closes + 60) % 1440;
  return { opensAt: clock(start), closesAt: clock((start + 240) % 1440) };
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type HoursProblem =
  /** Two spans on this day overlap. The server refuses the whole week for it. */
  | { readonly kind: 'overlap'; readonly day: WeekdayIndex; readonly indexes: readonly number[] }
  /** A time that is not a time. Caught here so the request is not sent at all. */
  | { readonly kind: 'invalidTime'; readonly day: WeekdayIndex; readonly index: number };

/**
 * Everything wrong with the draft, before it is sent.
 *
 * The server rejects an overlapping week with one message about the whole PUT,
 * so validating here is what lets the screen mark the two rows that clash
 * rather than showing a sentence above a table of seven identical-looking days.
 * It is never *stricter* than the server: touching blocks are allowed, because
 * a venue that closes at 15:00 and reopens at 15:00 has not overlapped
 * anything.
 */
export function hoursProblems(week: WeeklyHours): readonly HoursProblem[] {
  const problems: HoursProblem[] = [];

  for (const day of week) {
    const spans: { index: number; start: number; end: number }[] = [];

    for (const [index, block] of day.blocks.entries()) {
      const opens = toMinutes(block.opensAt);
      const closes = toMinutes(block.closesAt);
      if (opens < 0 || closes < 0) {
        problems.push({ kind: 'invalidTime', day: day.day, index });
        continue;
      }
      // A span that crosses midnight is measured forward from its opening —
      // 22:00–01:00 becomes 22:00–25:00 — so it can be compared with an
      // ordinary one without special cases everywhere below.
      spans.push({ index, start: opens, end: closes <= opens ? closes + 1440 : closes });
    }

    const ordered = [...spans].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      if (current.start < previous.end) {
        problems.push({
          kind: 'overlap',
          day: day.day,
          indexes: [previous.index, current.index],
        });
      }
    }
  }

  return problems;
}

/** Rows to mark on one day, from the problem list. */
export function problemIndexes(
  problems: readonly HoursProblem[],
  day: WeekdayIndex,
): ReadonlySet<number> {
  const marked = new Set<number>();
  for (const problem of problems) {
    if (problem.day !== day) continue;
    if (problem.kind === 'overlap') for (const index of problem.indexes) marked.add(index);
    else marked.add(problem.index);
  }
  return marked;
}

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

export function isDirty(state: HoursState): boolean {
  return JSON.stringify(state.saved) !== JSON.stringify(state.draft);
}

export function isClosed(day: HoursDay): boolean {
  return day.blocks.length === 0;
}

/**
 * The string the diner sees on the branch card, from this data.
 *
 * Shown on the editor because it is generated from what is being typed and
 * getting it wrong is silently visible to every user of the product — a venue
 * whose card says "closed" all evening because somebody entered 01:00 as the
 * closing time and the screen never showed them what that produced.
 *
 * `null` when the venue is shut on that day, which the card renders as "closed"
 * rather than as an empty range.
 */
export function dinerPreview(day: HoursDay): {
  readonly spans: readonly { readonly text: string; readonly nextDay: boolean }[];
  readonly totalMinutes: number;
} {
  return {
    spans: day.blocks.map((block) => ({
      text: `${block.opensAt} – ${block.closesAt}`,
      nextDay: closesNextDay(block),
    })),
    totalMinutes: day.blocks.reduce((sum, block) => sum + blockMinutes(block), 0),
  };
}
