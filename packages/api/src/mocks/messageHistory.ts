import { branchDayKey, instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';
import {
  MESSAGE_HISTORY_KEPT_DAYS,
  MESSAGE_HISTORY_PAGE_SIZE,
  addLocalDays,
  compareHistoryItems,
  localDaysBetween,
  matchesHistorySearch,
  messageHistoryViolations,
  type ConversationOutcome,
  type MessageHistoryItem,
  type MessageHistoryPage,
  type MessageHistoryQuery,
} from '../contracts/messageHistory';
import type {
  ConversationMessage,
  ConversationSubjectRef,
  MessageAnswer,
  MessageStatus,
  StaffConversation,
} from '../contracts/messages';
import { validationFailed } from './problems';

/**
 * Message history for the console mock (2026-10-24): twelve months of a
 * branch's guest threads, seeded once per branch relative to the mock's clock
 * and read only — nothing here marks anything read, as nothing on the server
 * does.
 *
 * The seed is deterministic (a PRNG keyed by the branch id), so a reload
 * shows the same history and a test can count on it. The first four threads
 * are the History board's own (Ani M., Karen S., Mariam K., Davit H.); the
 * rest are a year of mixed bookings and takeaway orders, denser in the last
 * fortnight, with every outcome: came, no-show, cancelled, declined,
 * upcoming, collected, in progress.
 */

export interface MockHistoryBranchInfo {
  readonly timeZoneId: string;
  readonly venueName: string;
}

export interface MockMessageHistoryOptions {
  readonly now: () => Date;
  /** The branch's clock and venue, or `null` for a branch this world does not have. */
  readonly branch: (branchId: string) => MockHistoryBranchInfo | null;
  /** Every branch of the world: a thread asked for by id alone is looked for in each. */
  readonly branchIds: () => readonly string[];
}

interface HistoryRecord {
  readonly branchId: string;
  readonly item: MessageHistoryItem;
  readonly thread: StaffConversation;
}

const MINUTE = 60_000;

const GUESTS = [
  'Անի Մարտիրոսյան',
  'Կարեն Սարգսյան',
  'Մարիամ Կարապետյան',
  'Դավիթ Հովհաննիսյան',
  'Լուսինե Ավետիսյան',
  'Արման Գևորգյան',
  'Նարինե Պողոսյան',
  'Տիգրան Մկրտչյան',
  'Սոնա Հարությունյան',
  'Գոռ Վարդանյան',
  'Մանե Ղազարյան',
  'Հայկ Ստեփանյան',
  'Էլեն Մանուկյան',
  'Սամվել Խաչատրյան',
  'Լիանա Բաղդասարյան',
  'Ռուբեն Դավթյան',
] as const;

const STAFF = ['Լիլիթ Հակոբյան', 'Արամ Սարգսյան', 'Նարե Գրիգորյան', 'Տիգրան Պետրոսյան'] as const;

const BOOKING_QUESTIONS = [
  'Կարո՞ղ ենք պատշգամբում նստել։',
  'Մանկական աթոռ կլինի՞։',
  'Կարո՞ղ եմ շունս բերել։',
  'Կարո՞ղ ենք մեկ հոգով ավելի լինել։',
  'Ծննդյան տորթ կարո՞ղ ենք բերել։',
  'Կա՞ անգլուտեն ուտեստ։',
  'Պատուհանի մոտ սեղան կլինի՞։',
] as const;

const BOOKING_ANSWERS = [
  'Այո, սեղանը պատշգամբում է։',
  'Այո, աթոռը կդնենք սեղանի մոտ։',
  'Փոքր շները կարող են, այո։',
  'Այո, սեղանը մեծ է, տեղ կա։',
  'Իհարկե, տորթը կպահենք սառնարանում։',
  'Այո, մենյուում նշված են։',
  'Այո, կպահենք պատուհանի մոտ։',
] as const;

const TAKEAWAY_QUESTIONS = [
  'Կարո՞ղ եմ 10 րոպե շուտ գալ վերցնելու',
  'Կարո՞ղ եք առանց սոխի',
  'Սոուսը առանձին կդնե՞ք',
  'Կանխիկ կարո՞ղ եմ վճարել',
] as const;

const TAKEAWAY_ANSWERS = [
  'Այո, կարող եք',
  'Իհարկե, առանց սոխի',
  'Այո, առանձին',
  'Այո, վճարում եք վերցնելիս',
] as const;

const THANKS = ['Շնորհակալություն։', 'Լավ, շնորհակալ եմ։', 'Հիանալի է։'] as const;

/** mulberry32: a small, fast, seedable PRNG. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hash(text: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16_777_619);
  }
  return value >>> 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A message as the seed writes it: who, what, and when. */
interface SeedMessage {
  readonly author: 'guest' | 'venue' | 'system';
  readonly kind: 'text' | 'askComing' | 'answer' | 'status';
  readonly text?: string | undefined;
  readonly answer?: MessageAnswer | undefined;
  readonly status?: MessageStatus | undefined;
  readonly staffName?: string | undefined;
  readonly atMs: number;
}

/** What one seeded thread is about. */
interface SeedSubject {
  readonly kind: 'reservation' | 'takeaway';
  readonly guestName: string;
  readonly label: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly partySize: number | null;
  readonly itemCount: number | null;
  readonly totalAmd: number | null;
  readonly outcome: ConversationOutcome;
  readonly open: boolean;
}

export function createMockMessageHistory(options: MockMessageHistoryOptions) {
  const byBranch = new Map<string, readonly HistoryRecord[]>();
  const bySubject = new Map<string, HistoryRecord>();

  function zoneOf(branchId: string): TimeZone {
    return (options.branch(branchId)?.timeZoneId ?? 'Asia/Yerevan') as TimeZone;
  }

  function localStamp(ms: number, zone: TimeZone): { date: string; time: string } {
    const parts = zonedParts(new Date(ms), zone);
    return {
      date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
      time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    };
  }

  function atClock(date: string, time: string, zone: TimeZone): number {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const [hour, minute] = time.split(':').map(Number) as [number, number];
    return instantFromZonedClock({ year, month, day, hour, minute }, zone).getTime();
  }

  function build(
    branchId: string,
    venueName: string,
    zone: TimeZone,
    index: number,
    subject: SeedSubject,
    seeds: readonly SeedMessage[],
  ): HistoryRecord {
    const ref: ConversationSubjectRef = {
      kind: subject.kind,
      id: `${branchId}-hist-${subject.kind === 'takeaway' ? 't' : 'r'}${index}`,
    };
    const conversationId = `${branchId}-conv-${index}`;
    const sorted = [...seeds].sort((a, b) => a.atMs - b.atMs);
    const messages: ConversationMessage[] = sorted.map((seed, position) => ({
      id: `${conversationId}-m${position + 1}`,
      author: seed.author,
      kind: seed.kind,
      text: seed.kind === 'text' ? (seed.text ?? '') : null,
      answer: seed.answer ?? null,
      status: seed.status ?? null,
      createdAtUtc: new Date(seed.atMs).toISOString(),
      staffName: seed.author === 'venue' ? (seed.staffName ?? null) : null,
    }));
    const counted = messages.filter((message) => message.author !== 'system');
    const staffNames: string[] = [];
    for (const message of messages) {
      if (message.staffName && !staffNames.includes(message.staffName)) {
        staffNames.push(message.staffName);
      }
    }
    // The last typed guest text with no venue message after it.
    let unanswered = false;
    for (const message of messages) {
      if (message.author === 'guest' && message.kind === 'text') unanswered = true;
      else if (message.author === 'venue') unanswered = false;
    }
    const first = messages[0]!;
    const last = messages.at(-1)!;
    const lastStamp = localStamp(Date.parse(last.createdAtUtc), zone);
    const startUtc =
      subject.kind === 'reservation'
        ? new Date(atClock(subject.localDate, subject.localTime, zone)).toISOString()
        : null;
    const item: MessageHistoryItem = {
      conversationId,
      subject: {
        ...ref,
        label: subject.label,
        guestName: subject.guestName,
        localDate: subject.localDate,
        localTime: subject.localTime,
        partySize: subject.partySize,
        itemCount: subject.itemCount,
        totalAmd: subject.totalAmd,
        outcome: subject.outcome,
      },
      messageCount: counted.length,
      firstAtUtc: first.createdAtUtc,
      lastAtUtc: last.createdAtUtc,
      lastLocal: `${lastStamp.date} ${lastStamp.time}`,
      staffNames,
      unanswered,
      open: subject.open,
    };
    const thread: StaffConversation = {
      conversationId,
      subject: {
        ...ref,
        venueName,
        branchId,
        startUtc,
        localDate: subject.localDate,
        localTime: subject.localTime,
        partySize: subject.partySize,
        tableLabel: subject.kind === 'reservation' ? subject.label : null,
        takeawayCode: subject.kind === 'takeaway' ? subject.label : null,
        readyAtLocal: subject.kind === 'takeaway' ? subject.localTime : null,
        readyAtUtc:
          subject.kind === 'takeaway'
            ? new Date(atClock(subject.localDate, subject.localTime, zone)).toISOString()
            : null,
      },
      open: subject.open,
      closesAtUtc: subject.open ? null : new Date(Date.parse(last.createdAtUtc)).toISOString(),
      guestsCanWrite: true,
      venuePhone: null,
      pendingAsk: subject.open && last.kind === 'askComing',
      venueLastReadUtc: last.createdAtUtc,
      unreadCount: 0,
      messages,
      guestName: subject.guestName,
      // Never printed, and the console has no Call.
      guestPhone: '',
      guestLastReadUtc: last.createdAtUtc,
      // The console never writes; the floor's own read says who may.
      canWrite: false,
    };
    return { branchId, item, thread };
  }

  /** The History board's four threads, relative to now. */
  function boardSeeds(
    branchId: string,
    venueName: string,
    zone: TimeZone,
    nowMs: number,
  ): HistoryRecord[] {
    const today = branchDayKey(new Date(nowMs), zone);
    const ago = (minutes: number) => nowMs - minutes * MINUTE;
    // Ani's booking starts in about half an hour, on a quarter hour.
    const startMs = Math.ceil((nowMs + 30 * MINUTE) / (15 * MINUTE)) * 15 * MINUTE;
    const start = localStamp(startMs, zone);
    const held = localStamp(startMs + 15 * MINUTE, zone);
    const yesterday = addLocalDays(today, -1);
    const fourDaysAgo = addLocalDays(today, -4);
    return [
      build(
        branchId,
        venueName,
        zone,
        1,
        {
          kind: 'reservation',
          guestName: 'Անի Մարտիրոսյան',
          label: '6',
          localDate: start.date,
          localTime: start.time,
          partySize: 4,
          itemCount: null,
          totalAmd: null,
          outcome: 'upcoming',
          open: true,
        },
        [
          {
            author: 'guest',
            kind: 'text',
            text: 'Բարև։ Մենք 4 հոգի ենք, մեկին մանկական աթոռ է պետք։',
            atMs: ago(390),
          },
          {
            author: 'venue',
            kind: 'text',
            text: 'Բարև, Անի։ Աթոռը կդնենք սեղան 6-ի մոտ։',
            staffName: STAFF[0],
            atMs: ago(375),
          },
          { author: 'venue', kind: 'askComing', staffName: STAFF[1], atMs: ago(30) },
          {
            author: 'guest',
            kind: 'answer',
            answer: { kind: 'late', lateMinutes: 15 },
            atMs: ago(28),
          },
          {
            author: 'system',
            kind: 'status',
            status: { answer: 'late', heldUntilLocal: held.time, cancelled: false },
            atMs: ago(28) + 1_000,
          },
        ],
      ),
      build(
        branchId,
        venueName,
        zone,
        2,
        {
          kind: 'takeaway',
          guestName: 'Կարեն Սարգսյան',
          label: 'T-485',
          localDate: today,
          localTime: localStamp(ago(-25), zone).time,
          partySize: null,
          itemCount: 3,
          totalAmd: 5_400,
          outcome: 'inProgress',
          open: true,
        },
        [
          {
            author: 'guest',
            kind: 'text',
            text: 'Կարո՞ղ եմ 10 րոպե շուտ գալ վերցնելու',
            atMs: ago(33),
          },
          {
            author: 'venue',
            kind: 'text',
            text: 'Այո, կարող եք',
            staffName: STAFF[1],
            atMs: ago(32),
          },
        ],
      ),
      build(
        branchId,
        venueName,
        zone,
        3,
        {
          kind: 'reservation',
          guestName: 'Մարիամ Կարապետյան',
          label: '3',
          localDate: yesterday,
          localTime: '21:00',
          partySize: 6,
          itemCount: null,
          totalAmd: null,
          outcome: 'came',
          open: false,
        },
        [
          {
            author: 'guest',
            kind: 'text',
            text: 'Կարո՞ղ ենք պատշգամբում նստել։',
            atMs: atClock(yesterday, '17:06', zone),
          },
          {
            author: 'venue',
            kind: 'text',
            text: 'Այո, սեղան 3-ը պատշգամբում է։',
            staffName: STAFF[0],
            atMs: atClock(yesterday, '17:10', zone),
          },
        ],
      ),
      build(
        branchId,
        venueName,
        zone,
        4,
        {
          kind: 'reservation',
          guestName: 'Դավիթ Հովհաննիսյան',
          label: '7',
          localDate: fourDaysAgo,
          localTime: '20:00',
          partySize: 2,
          itemCount: null,
          totalAmd: null,
          outcome: 'noShow',
          open: false,
        },
        [
          {
            author: 'guest',
            kind: 'text',
            text: 'Կարո՞ղ եմ շունս բերել։',
            atMs: atClock(fourDaysAgo, '13:02', zone),
          },
        ],
      ),
    ];
  }

  /** A year of threads after the board's four, one day at a time. */
  function yearSeeds(
    branchId: string,
    venueName: string,
    zone: TimeZone,
    nowMs: number,
  ): HistoryRecord[] {
    const next = random(hash(branchId));
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
    const chance = (p: number) => next() < p;
    const today = branchDayKey(new Date(nowMs), zone);
    const records: HistoryRecord[] = [];
    let index = 5;
    // Day 0 is the board's; the year starts yesterday and keeps 365 days back.
    for (let back = 1; back < MESSAGE_HISTORY_KEPT_DAYS; back += 1) {
      const day = addLocalDays(today, -back);
      const perDay =
        back <= 14
          ? 2 + Math.floor(next() * 3)
          : back <= 60
            ? Math.floor(next() * 3)
            : chance(0.55)
              ? 1
              : 0;
      for (let n = 0; n < perDay; n += 1) {
        const takeaway = chance(0.3);
        // The board's four guests are its own; the year is everybody else.
        const guestName = pick(GUESTS.slice(4));
        const first = guestName.split(' ')[0]!;
        const hour = 11 + Math.floor(next() * 11);
        const minute = Math.floor(next() * 4) * 15;
        const slot = `${pad(hour)}:${pad(minute)}`;
        const slotMs = atClock(day, slot, zone);
        const writer = pick(STAFF);
        const other = pick(STAFF);
        const seeds: SeedMessage[] = [];
        let outcome: ConversationOutcome;
        const roll = next();
        if (takeaway) {
          outcome =
            roll < 0.8
              ? 'collected'
              : roll < 0.87
                ? 'noShow'
                : roll < 0.94
                  ? 'declined'
                  : 'cancelled';
          const which = Math.floor(next() * TAKEAWAY_QUESTIONS.length);
          seeds.push({
            author: 'guest',
            kind: 'text',
            text: TAKEAWAY_QUESTIONS[which],
            atMs: slotMs - 40 * MINUTE,
          });
          if (chance(0.9)) {
            seeds.push({
              author: 'venue',
              kind: 'text',
              text: TAKEAWAY_ANSWERS[which],
              staffName: writer,
              atMs: slotMs - (36 - Math.floor(next() * 6)) * MINUTE,
            });
            if (chance(0.3)) {
              seeds.push({
                author: 'venue',
                kind: 'text',
                text: 'Ձեր պատվերը պատրաստ է',
                staffName: other,
                atMs: slotMs - 2 * MINUTE,
              });
            }
          }
          const items = 1 + Math.floor(next() * 6);
          records.push(
            build(
              branchId,
              venueName,
              zone,
              index,
              {
                kind: 'takeaway',
                guestName,
                label: `T-${100 + Math.floor(next() * 900)}`,
                localDate: day,
                localTime: slot,
                partySize: null,
                itemCount: items,
                totalAmd: (12 + Math.floor(next() * 150)) * 100,
                outcome,
                open: false,
              },
              seeds,
            ),
          );
        } else {
          const scenario = next();
          outcome =
            roll < 0.7 ? 'came' : roll < 0.8 ? 'noShow' : roll < 0.92 ? 'cancelled' : 'declined';
          if (scenario < 0.45) {
            // A question, answered — sometimes with a thank-you after.
            const which = Math.floor(next() * BOOKING_QUESTIONS.length);
            seeds.push({
              author: 'guest',
              kind: 'text',
              text: BOOKING_QUESTIONS[which],
              atMs: slotMs - (180 + Math.floor(next() * 300)) * MINUTE,
            });
            seeds.push({
              author: 'venue',
              kind: 'text',
              text: BOOKING_ANSWERS[which],
              staffName: writer,
              atMs: seeds[0]!.atMs + (3 + Math.floor(next() * 20)) * MINUTE,
            });
            if (chance(0.35)) {
              seeds.push({
                author: 'guest',
                kind: 'text',
                text: pick(THANKS),
                atMs: seeds[1]!.atMs + 2 * MINUTE,
              });
            }
          } else if (scenario < 0.75) {
            // "Are you coming?", and the answer.
            const askMs = slotMs - 30 * MINUTE;
            seeds.push({ author: 'venue', kind: 'askComing', staffName: writer, atMs: askMs });
            if (outcome === 'cancelled') {
              seeds.push({
                author: 'guest',
                kind: 'answer',
                answer: { kind: 'notComing', lateMinutes: null },
                atMs: askMs + 4 * MINUTE,
              });
              seeds.push({
                author: 'system',
                kind: 'status',
                status: { answer: 'notComing', heldUntilLocal: null, cancelled: true },
                atMs: askMs + 4 * MINUTE + 1_000,
              });
            } else if (outcome === 'noShow') {
              // Asked, never answered.
            } else if (chance(0.5)) {
              const late = pick([10, 15, 30] as const);
              seeds.push({
                author: 'guest',
                kind: 'answer',
                answer: { kind: 'late', lateMinutes: late },
                atMs: askMs + 3 * MINUTE,
              });
              seeds.push({
                author: 'system',
                kind: 'status',
                status: {
                  answer: 'late',
                  heldUntilLocal: localStamp(slotMs + late * MINUTE, zone).time,
                  cancelled: false,
                },
                atMs: askMs + 3 * MINUTE + 1_000,
              });
            } else {
              seeds.push({
                author: 'guest',
                kind: 'answer',
                answer: { kind: 'coming', lateMinutes: null },
                atMs: askMs + 2 * MINUTE,
              });
              seeds.push({
                author: 'system',
                kind: 'status',
                status: { answer: 'coming', heldUntilLocal: null, cancelled: false },
                atMs: askMs + 2 * MINUTE + 1_000,
              });
            }
          } else if (scenario < 0.88) {
            // Nobody answered the guest.
            seeds.push({
              author: 'guest',
              kind: 'text',
              text: pick(BOOKING_QUESTIONS),
              atMs: slotMs - (60 + Math.floor(next() * 200)) * MINUTE,
            });
          } else {
            // The venue wrote first, two people answered.
            seeds.push({
              author: 'venue',
              kind: 'text',
              text: `Բարև, ${first}։ Ձեր սեղանը պատրաստ է։`,
              staffName: writer,
              atMs: slotMs - 20 * MINUTE,
            });
            seeds.push({
              author: 'guest',
              kind: 'text',
              text: 'Շնորհակալություն, 5 րոպեից կլինենք։',
              atMs: slotMs - 18 * MINUTE,
            });
            seeds.push({
              author: 'venue',
              kind: 'text',
              text: 'Սպասում ենք։',
              staffName: other,
              atMs: slotMs - 17 * MINUTE,
            });
          }
          records.push(
            build(
              branchId,
              venueName,
              zone,
              index,
              {
                kind: 'reservation',
                guestName,
                label: String(1 + Math.floor(next() * 14)),
                localDate: day,
                localTime: slot,
                partySize: 2 + Math.floor(next() * 7),
                itemCount: null,
                totalAmd: null,
                outcome,
                open: false,
              },
              seeds,
            ),
          );
        }
        index += 1;
      }
    }
    // A thread whose every message was before the kept window is not kept.
    const oldest = addLocalDays(today, -MESSAGE_HISTORY_KEPT_DAYS);
    return records.filter(
      (record) => (localDaysBetween(oldest, record.item.lastLocal.slice(0, 10)) ?? -1) >= 0,
    );
  }

  function recordsOf(branchId: string): readonly HistoryRecord[] {
    const seeded = byBranch.get(branchId);
    if (seeded) return seeded;
    const info = options.branch(branchId);
    if (!info) {
      byBranch.set(branchId, []);
      return [];
    }
    const zone = zoneOf(branchId);
    const nowMs = options.now().getTime();
    const records = [
      ...boardSeeds(branchId, info.venueName, zone, nowMs),
      ...yearSeeds(branchId, info.venueName, zone, nowMs),
    ].sort((a, b) => compareHistoryItems(a.item, b.item));
    byBranch.set(branchId, records);
    for (const record of records) {
      bySubject.set(`${record.item.subject.kind}:${record.item.subject.id}`, record);
    }
    return records;
  }

  function cursorOf(item: MessageHistoryItem): string {
    return `${item.lastAtUtc}|${item.conversationId}`;
  }

  return {
    /**
     * `GET …/conversations/history`: the 422 names every bad field, as the
     * server's does; otherwise the range by the last message's day, then the
     * kind, the search and "unanswered only", newest first, a page at a time.
     */
    list(url: string, branchId: string, query: MessageHistoryQuery): MessageHistoryPage {
      const zone = zoneOf(branchId);
      const today = branchDayKey(options.now(), zone);
      const violations = [...messageHistoryViolations(query, today)];
      const records = recordsOf(branchId);
      let start = 0;
      if (query.cursor) {
        const at = records.findIndex((record) => cursorOf(record.item) === query.cursor);
        if (at < 0) {
          violations.push({ field: 'cursor', message: 'The cursor is not one this list gave.' });
        } else {
          start = at + 1;
        }
      }
      if (violations.length > 0) {
        throw validationFailed(
          url,
          violations.map((violation) => ({
            field: violation.field,
            message: violation.message,
            ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
            ...(violation.min !== undefined ? { min: violation.min } : {}),
            ...(violation.max !== undefined ? { max: violation.max } : {}),
          })),
        );
      }
      const limit = query.limit ?? MESSAGE_HISTORY_PAGE_SIZE;
      const matching: MessageHistoryItem[] = [];
      let nextCursor: string | null = null;
      for (let at = start; at < records.length; at += 1) {
        const item = records[at]!.item;
        const day = item.lastLocal.slice(0, 10);
        if (day < query.from || day > query.to) continue;
        if (query.kind !== 'all' && item.subject.kind !== query.kind) continue;
        if (query.unansweredOnly && !item.unanswered) continue;
        if (!matchesHistorySearch(item.subject, query.q)) continue;
        if (matching.length === limit) {
          nextCursor = cursorOf(matching.at(-1)!);
          break;
        }
        matching.push(item);
      }
      return { items: matching, nextCursor, from: query.from, to: query.to };
    },

    /**
     * One thread as the floor reads it, with its branch so the caller can
     * check the scope; `null` when this world has no such subject.
     */
    thread(
      subject: ConversationSubjectRef,
    ): { readonly branchId: string; readonly thread: StaffConversation } | null {
      const key = `${subject.kind}:${subject.id}`;
      if (!bySubject.has(key)) for (const branchId of options.branchIds()) recordsOf(branchId);
      const record = bySubject.get(key);
      return record ? { branchId: record.branchId, thread: record.thread } : null;
    },
  };
}

export type MockMessageHistory = ReturnType<typeof createMockMessageHistory>;
