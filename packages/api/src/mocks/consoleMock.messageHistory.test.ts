import { describe, expect, it } from 'vitest';
import {
  defaultMessageHistoryFilters,
  type MessageHistoryFilters,
} from '../contracts/messageHistory';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Message history in the console mock (2026-10-24): a year of each branch's
 * threads, the History board's four first, scoped as the server scopes
 * Reviews, filtered and paged as the server does, read only.
 */

const NORTH = 'b-lumen-north';
const CASCADE = 'b-lumen-cascade';
/** Midday in Yerevan (UTC+4): the board's threads of "today" are all before it. */
const NOW = new Date('2026-10-24T08:00:00Z');
const TODAY = '2026-10-24';

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

function gateway(
  role: 'owner' | 'manager' | 'generalManager' | 'waiter' | 'platformAdmin' = 'owner',
) {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => NOW });
}

function filters(overrides: Partial<MessageHistoryFilters> = {}): MessageHistoryFilters {
  return { ...defaultMessageHistoryFilters(TODAY), ...overrides };
}

const YEAR = filters({ from: '2025-10-24' });

describe('the history list', () => {
  it('opens on the board’s threads, newest first, inside the last seven days', async () => {
    const page = await gateway().listMessageHistory(NORTH, filters());
    const names = page.items.map((item) => item.subject.guestName);
    expect(names.slice(0, 2)).toEqual(['Անի Մարտիրոսյան', 'Կարեն Սարգսյան']);
    expect(names).toContain('Մարիամ Կարապետյան');
    expect(names).toContain('Դավիթ Հովհաննիսյան');
    const times = page.items.map((item) => Date.parse(item.lastAtUtc));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const item of page.items) {
      expect(item.lastLocal.slice(0, 10) >= '2026-10-18').toBe(true);
      expect(Date.parse(item.lastAtUtc)).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(page).toMatchObject({ from: '2026-10-18', to: TODAY });
  });

  it('counts no system line, names each writer once in order, and marks the unanswered', async () => {
    const page = await gateway().listMessageHistory(NORTH, filters());
    const ani = page.items.find((item) => item.subject.id === `${NORTH}-hist-r1`)!;
    expect(ani).toMatchObject({
      messageCount: 4,
      staffNames: ['Լիլիթ Հակոբյան', 'Արամ Սարգսյան'],
      unanswered: false,
      subject: { kind: 'reservation', label: '6', partySize: 4, outcome: 'upcoming' },
    });
    const davit = page.items.find((item) => item.subject.id === `${NORTH}-hist-r4`)!;
    expect(davit).toMatchObject({ messageCount: 1, staffNames: [], unanswered: true });
    expect(davit.subject.outcome).toBe('noShow');
  });

  it('keeps a year of every kind and outcome, and nothing older', async () => {
    const console = gateway();
    const items = [];
    let cursor: string | null = null;
    do {
      const page = await console.listMessageHistory(NORTH, { ...YEAR, cursor, limit: 100 });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(items.length).toBeGreaterThan(150);
    expect(new Set(items.map((item) => item.conversationId)).size).toBe(items.length);
    const outcomes = new Set(items.map((item) => item.subject.outcome));
    for (const outcome of [
      'came',
      'noShow',
      'cancelled',
      'declined',
      'upcoming',
      'collected',
      'inProgress',
    ]) {
      expect(outcomes).toContain(outcome);
    }
    expect(items.some((item) => item.lastLocal < '2026-01-01')).toBe(true);
    expect(items.every((item) => item.lastLocal.slice(0, 10) >= '2025-10-24')).toBe(true);
  });

  it('pages by the cursor without repeating or skipping a row', async () => {
    const console = gateway();
    const all = await console.listMessageHistory(NORTH, { ...YEAR, limit: 100 });
    const first = await console.listMessageHistory(NORTH, { ...YEAR, limit: 30 });
    const second = await console.listMessageHistory(NORTH, {
      ...YEAR,
      limit: 30,
      cursor: first.nextCursor,
    });
    expect(first.items).toHaveLength(30);
    expect([...first.items, ...second.items].map((item) => item.conversationId)).toEqual(
      all.items.slice(0, 60).map((item) => item.conversationId),
    );
  });

  it('filters by kind, by "unanswered only", and by the search', async () => {
    const console = gateway();
    const takeaway = await console.listMessageHistory(NORTH, { ...YEAR, kind: 'takeaway' });
    expect(takeaway.items.every((item) => item.subject.kind === 'takeaway')).toBe(true);
    const open = await console.listMessageHistory(NORTH, { ...YEAR, unansweredOnly: true });
    expect(open.items.length).toBeGreaterThan(0);
    expect(open.items.every((item) => item.unanswered)).toBe(true);
    const karen = await console.listMessageHistory(NORTH, filters({ q: 't485' }));
    expect(karen.items.map((item) => item.subject.label)).toEqual(['T-485']);
    const table = await console.listMessageHistory(NORTH, filters({ q: '6', kind: 'reservation' }));
    expect(table.items.every((item) => item.subject.label === '6')).toBe(true);
  });

  it('names every bad field in one 422 with the server’s bounds, the cursor too', async () => {
    const refused = await failing(
      gateway().listMessageHistory(NORTH, {
        ...filters({ from: '2026-10-25', q: 'x'.repeat(61) }),
        cursor: 'not-ours',
      }),
    );
    expect(refused).toBeInstanceOf(ValidationError);
    expect(
      (refused as ValidationError).violations.map(
        (violation) => `${violation.field}:${violation.bound ?? ''}`,
      ),
    ).toEqual(['from:conflict', 'q:max', 'cursor:required']);
    const old = await failing(
      gateway().listMessageHistory(NORTH, filters({ from: '2025-09-01', to: '2025-09-30' })),
    );
    expect(
      (old as ValidationError).violations.map(
        (violation) => `${violation.field}:${violation.bound ?? ''}`,
      ),
    ).toEqual(['from:min', 'to:min']);
  });

  it('defaults a blank start to six days before the end, and answers the range it read', async () => {
    const page = await gateway().listMessageHistory(NORTH, filters({ from: '', to: '2026-10-20' }));
    expect(page).toMatchObject({ from: '2026-10-14', to: '2026-10-20' });
    for (const item of page.items) {
      const day = item.lastLocal.slice(0, 10);
      expect(day >= '2026-10-14' && day <= '2026-10-20').toBe(true);
    }
    expect(await gateway().listMessageHistory(NORTH, filters({ from: '', to: '' }))).toMatchObject({
      from: '2026-10-18',
      to: TODAY,
    });
  });

  it('is a branch manager’s own branch only; waiters are refused; the platform may read', async () => {
    expect(
      (await gateway('manager').listMessageHistory(NORTH, filters())).items.length,
    ).toBeGreaterThan(0);
    expect(await failing(gateway('manager').listMessageHistory(CASCADE, filters()))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(await failing(gateway('waiter').listMessageHistory(NORTH, filters()))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      (await gateway('generalManager').listMessageHistory(CASCADE, filters())).items.length,
    ).toBeGreaterThan(0);
    expect(
      (await gateway('platformAdmin').listMessageHistory(CASCADE, filters())).items.length,
    ).toBeGreaterThan(0);
  });

  it('seeds the same history for the same branch, and another for another branch', async () => {
    const one = await gateway().listMessageHistory(CASCADE, YEAR);
    const two = await gateway().listMessageHistory(CASCADE, YEAR);
    expect(two.items).toEqual(one.items);
    const north = await gateway().listMessageHistory(NORTH, YEAR);
    expect(north.items.map((item) => item.subject.id)).not.toEqual(
      one.items.map((item) => item.subject.id),
    );
  });
});

describe('the thread beside it', () => {
  it('reads the whole thread with staff names and system lines, even before the list was read', async () => {
    const owner = gateway();
    const list = await gateway().listMessageHistory(NORTH, filters());
    const ani = list.items[0]!;
    const thread = await owner.getStaffConversation(ani.subject);
    expect(thread?.guestName).toBe('Անի Մարտիրոսյան');
    expect(
      thread?.messages.map((message) => [message.author, message.kind, message.staffName]),
    ).toEqual([
      ['guest', 'text', null],
      ['venue', 'text', 'Լիլիթ Հակոբյան'],
      ['venue', 'askComing', 'Արամ Սարգսյան'],
      ['guest', 'answer', null],
      ['system', 'status', null],
    ]);
    expect(thread?.unreadCount).toBe(0);
    // The staff view's own outcome, the same as the row's.
    expect(thread?.subject.outcome).toBe(ani.subject.outcome);
    expect(thread?.subject.tableLabel).toBe('6');
  });

  it('refuses another branch’s thread to a branch manager, and answers null for no such subject', async () => {
    const cascade = (await gateway().listMessageHistory(CASCADE, filters())).items[0]!;
    expect(await failing(gateway('manager').getStaffConversation(cascade.subject))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(await gateway().getStaffConversation({ kind: 'reservation', id: 'nope' })).toBeNull();
  });
});
