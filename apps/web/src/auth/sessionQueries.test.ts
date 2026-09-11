import { createQueryClient } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { forgetSessionQueries } from './sessionQueries';

/**
 * What a new session must not inherit from the last one, and what it may.
 *
 * The console's keys name a venue or a branch, not a caller, so the cache is
 * the only thing standing between "the owner just signed out" and "the manager
 * who signed in next is shown the owner's branches". The public page's keys
 * are the other way round: a menu is the same menu whoever is looking, and a
 * diner's booking is theirs by token, not by session.
 */
describe('forgetting a session', () => {
  it('drops the identity and everything the console read on its behalf', async () => {
    const client = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
    client.setQueryData(['currentUser', 'owner'], { id: 'u-1' });
    client.setQueryData(['console', 'managedVenue', 'v-1'], { branches: ['everything'] });
    client.setQueryData(['console', 'staff', 'v-1'], []);
    client.setQueryData(['console', 'report', 'covers', {}], {});

    await forgetSessionQueries(client);

    expect(client.getQueryData(['currentUser', 'owner'])).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: ['console'] })).toHaveLength(0);
  });

  it('leaves the public page and the counter tablet alone', async () => {
    const client = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
    // The diner-facing page: the same for everyone, and cached for a reason.
    client.setQueryData(['public', 'venue', 'lumen'], { name: 'Lumen' });
    client.setQueryData(['public', 'booking', 'tok'], { status: 'held' });
    client.setQueryData(['availability', 'b-1', '2026-09-11T18:00:00Z', 2], []);
    // The counter screen holds a device credential, not the console session.
    client.setQueryData(['staff', 'floor', 'b-1'], { tables: [] });

    await forgetSessionQueries(client);

    expect(client.getQueryData(['public', 'venue', 'lumen'])).toEqual({ name: 'Lumen' });
    expect(client.getQueryData(['public', 'booking', 'tok'])).toEqual({ status: 'held' });
    expect(client.getQueryData(['availability', 'b-1', '2026-09-11T18:00:00Z', 2])).toEqual([]);
    expect(client.getQueryData(['staff', 'floor', 'b-1'])).toEqual({ tables: [] });
  });
});
