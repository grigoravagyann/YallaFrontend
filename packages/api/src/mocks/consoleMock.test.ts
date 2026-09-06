import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { SlugTakenError, VenueHasOpenTabsError } from '../contracts/errors';
import { createConsoleMockGateway } from './consoleMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

describe('console mock — scope comes from the role, never from a url', () => {
  it('a platform admin is scoped to every venue', async () => {
    const user = await createConsoleMockGateway({ role: 'platformAdmin' }).getCurrentUser();
    expect(user.scope.venueId).toBeNull();
    expect(user.scope.branchIds).toEqual([]);
  });

  it('an owner is scoped to their venue and all of its branches', async () => {
    const user = await createConsoleMockGateway({ role: 'owner' }).getCurrentUser();
    expect(user.scope.venueId).not.toBeNull();
    expect(user.scope.branchIds.length).toBeGreaterThan(1);
  });

  it('a manager, a waiter and a kitchen account each get exactly one branch', async () => {
    for (const role of ['manager', 'waiter', 'kitchen'] as const) {
      const user = await createConsoleMockGateway({ role }).getCurrentUser();
      expect(user.scope.branchIds).toHaveLength(1);
    }
  });
});

describe('console mock — venues list', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('pages rather than returning everything', async () => {
    const page = await gateway.listVenues({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.page).toBe(1);
  });

  it('searches by name', async () => {
    const page = await gateway.listVenues({ search: 'lumen' });
    expect(page.items.map((v) => v.name)).toEqual(['Lumen Coffee']);
  });

  it('lists suspended venues rather than hiding them from the team', async () => {
    const page = await gateway.listVenues({ pageSize: 50 });
    expect(page.items.some((v) => v.status === 'suspended')).toBe(true);
  });

  it('carries the counts the list column shows', async () => {
    const page = await gateway.listVenues({ search: 'lumen' });
    const venue = page.items[0];
    expect(venue?.branchCount).toBe(3);
    expect(venue?.tableCount).toBeGreaterThan(0);
    expect(venue?.subscriptionTier).toBeTruthy();
  });
});

describe('console mock — destructive actions', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('suspending is reversible and never removes the row', async () => {
    const suspended = await gateway.suspendVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(suspended.status).toBe('suspended');
    expect(suspended.suspendedAtUtc).not.toBeNull();

    const resumed = await gateway.resumeVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(resumed.status).toBe('active');
    expect(resumed.suspendedAtUtc).toBeNull();
  });

  it('refuses to delete a venue with an open tab, and says which table', async () => {
    const caught = await gateway
      .deleteVenue({ venueId: 'v-lumen', commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(VenueHasOpenTabsError);
    // The payload is the point: "cannot delete" alone is not actionable.
    const blocked = caught as VenueHasOpenTabsError;
    expect(blocked.openTabs.length).toBeGreaterThan(0);
    expect(blocked.openTabs[0]?.branchName).toBeTruthy();
    expect(blocked.openTabs[0]?.tableLabel).toBeTruthy();
  });

  it('deletes a venue with nothing in service, as a soft delete', async () => {
    const deleted = await gateway.deleteVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(deleted.status).toBe('deleted');

    const listed = await gateway.listVenues({ pageSize: 50 });
    expect(listed.items.some((v) => v.id === 'v-greenbean')).toBe(false);

    const stillThere = await gateway.listVenues({ pageSize: 50, includeDeleted: true });
    expect(stillThere.items.some((v) => v.id === 'v-greenbean')).toBe(true);
  });
});

describe('console mock — creating a venue', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('creates the venue and its first branch in one command', async () => {
    const created = await gateway.createVenue({
      commandId: cmd(),
      name: 'Kond Bakery',
      slug: 'kond-bakery',
      type: 'cafe',
      firstBranch: {
        name: 'Kond',
        timeZoneId: 'Asia/Yerevan',
        address: '3 Paronyan Street, Yerevan',
        latitude: 40.1826,
        longitude: 44.5035,
      },
    });

    // A venue with no branch has no floor, no menu and no tables — it cannot be
    // onboarded, so it is never created in that state.
    expect(created.branches).toHaveLength(1);
    expect(created.branches[0]?.name).toBe('Kond');
    expect(created.branches[0]?.tableCount).toBe(0);
    expect(created.status).toBe('active');
  });

  it('rejects a slug already in use, naming the field at fault', async () => {
    const caught = await gateway
      .createVenue({
        commandId: cmd(),
        name: 'Lumen Coffee Two',
        slug: 'lumen-coffee',
        type: 'cafe',
        firstBranch: {
          name: 'Somewhere',
          timeZoneId: 'Asia/Yerevan',
          address: '1 Somewhere Street, Yerevan',
          latitude: 40.1792,
          longitude: 44.4991,
        },
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(SlugTakenError);
    expect((caught as SlugTakenError).slug).toBe('lumen-coffee');
  });
});
