import { describe, expect, it } from 'vitest';
import {
  checkedFetch,
  offSchema,
  requestViolations,
  responseViolations,
  routeFor,
  takeViolations,
  violations,
} from './wireSchema.testkit';

/**
 * The check every gateway test's stubs go through. If it went quiet, every
 * stub would be unchecked again without a single test failing — so it proves
 * here that it still finds each kind of drift.
 */

const SETTINGS = {
  enabled: true,
  autoAccept: false,
  prepMinutes: 25,
  lastOrderMinutes: 45,
  maxInProgress: 6,
  acceptWindowMinutes: 5,
  noShowAfterMinutes: 30,
  bounds: {
    prepMinutesMin: 5,
    prepMinutesMax: 90,
    prepMinutesStep: 5,
    lastOrderMinutesMin: 0,
    lastOrderMinutesMax: 120,
    lastOrderMinutesStep: 15,
    maxInProgressMin: 1,
    maxInProgressMax: 30,
  },
};

function settingsRoute() {
  const route = routeFor('GET', '/api/branches/b-1/takeaway-settings');
  if (!route) throw new Error('the takeaway settings route left swagger.json');
  return route;
}

describe('finding the route', () => {
  it('matches a parameter to any one segment, and prefers a literal one', () => {
    expect(routeFor('GET', '/api/branches/b-1/takeaway-settings')?.template).toBe(
      '/api/branches/{branchId}/takeaway-settings',
    );
    expect(routeFor('GET', '/api/public/branches/search')?.template).toBe(
      '/api/public/branches/search',
    );
    expect(routeFor('GET', '/api/public/branches/b-1')?.template).toBe(
      '/api/public/branches/{branchId}',
    );
  });

  it('finds nothing for a method or a path the backend does not serve', () => {
    expect(routeFor('DELETE', '/api/branches/b-1/takeaway-settings')).toBeUndefined();
    expect(routeFor('GET', '/api/branches/b-1/takeaway-settings/extra')).toBeUndefined();
  });
});

describe('an answer against its schema', () => {
  it('passes the shape the backend writes', () => {
    expect(responseViolations(settingsRoute(), 200, SETTINGS)).toEqual([]);
  });

  it('names a missing field, an unknown one, a wrong type and a forbidden null', () => {
    const { prepMinutes: _dropped, ...withoutPrep } = SETTINGS;
    const drifted = {
      ...withoutPrep,
      prepMinutesOld: 25,
      autoAccept: 'no',
      bounds: { ...SETTINGS.bounds, prepMinutesMin: null },
    };
    expect(responseViolations(settingsRoute(), 200, drifted)).toEqual([
      '$: missing required prepMinutes',
      '$.autoAccept: expected boolean, got string "no"',
      '$.bounds.prepMinutesMin: null, but the schema does not allow null',
      '$: prepMinutesOld is not in the schema',
    ]);
  });

  it('refuses a fraction where the schema wants a whole number, and a value outside an enum', () => {
    expect(responseViolations(settingsRoute(), 200, { ...SETTINGS, prepMinutes: 25.5 })).toEqual([
      '$.prepMinutes: expected integer, got number 25.5',
    ]);
    const status = { $ref: '#/components/schemas/Yalla.Domain.Takeaway.TakeawayStatus' };
    expect(violations(2, status)).toEqual([]);
    expect(violations(42, status)).toEqual([expect.stringMatching(/^\$: 42 is not one of \[/)]);
  });

  it('refuses a success status the route does not declare, and a body on a bodiless one', () => {
    expect(responseViolations(settingsRoute(), 201, SETTINGS)).toEqual([
      'the route answers 200 on success, never 201',
    ]);
    const revoke = routeFor('POST', '/api/branches/b-1/devices/d-1/revoke');
    if (!revoke) throw new Error('the device revoke route left swagger.json');
    expect(responseViolations(revoke, 204, undefined)).toEqual([]);
    expect(responseViolations(revoke, 204, { revoked: true })).toEqual([
      'the route answers 204 with no body, but the stub sends one',
    ]);
  });

  it('reads members left undefined as absent, the way JSON.stringify sends them', () => {
    expect(responseViolations(settingsRoute(), 200, { ...SETTINGS, extra: undefined })).toEqual([]);
  });
});

describe('a request body against its schema', () => {
  it('names a field the route does not take, and a body sent to a route that takes none', () => {
    const put = routeFor('PUT', '/api/branches/b-1/takeaway-settings');
    if (!put) throw new Error('the takeaway settings PUT left swagger.json');
    expect(requestViolations(put, { enabledd: true })).toContain(
      '$: enabledd is not in the schema',
    );
    expect(requestViolations(settingsRoute(), { anything: 1 })).toEqual([
      'the route takes no JSON body, but the gateway sent one',
    ]);
  });
});

describe('the fetch boundary', () => {
  const URL = 'https://api.test.yalla.am/api/branches/b-1/takeaway-settings';
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('records a drifted answer even when the caller swallows it', async () => {
    const fetch = checkedFetch(async () => json({ ...SETTINGS, enabled: 'yes' }));
    await fetch(URL, { method: 'GET' });
    expect(takeViolations()).toEqual([
      'GET /api/branches/b-1/takeaway-settings (/api/branches/{branchId}/takeaway-settings) 200: $.enabled: expected boolean, got string "yes"',
    ]);
  });

  it('records a success from a route the backend does not have, and ignores its 404', async () => {
    await checkedFetch(async () => json({}))(`${URL}/nope`);
    await checkedFetch(async () => new Response(null, { status: 404 }))(`${URL}/nope`);
    expect(takeViolations()).toEqual([
      'GET /api/branches/b-1/takeaway-settings/nope: answered 200, but swagger.json has no such route',
    ]);
  });

  it('leaves a refusal alone and lets offSchema excuse a deliberate answer', async () => {
    await checkedFetch(async () => json({ code: 'forbidden' }, 403))(URL);
    await checkedFetch(async () => offSchema(json({ old: true }), 'a server from before'))(URL);
    expect(takeViolations()).toEqual([]);
  });

  it('demands a reason to excuse an answer', () => {
    expect(() => offSchema({}, ' ')).toThrow('offSchema needs a reason');
  });
});
