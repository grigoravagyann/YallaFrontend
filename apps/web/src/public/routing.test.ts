import { createMockGateway, createPublicMockGateway, type PublicGateway } from '@yalla/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { RESERVED_FIRST_SEGMENTS, isPublicPath } from '../publicRoutes';

/**
 * Which URL belongs to whom, and which slug pair resolves to what.
 *
 * Two questions that look like routing trivia and are not. The first decides
 * whether a stranger's link loads the public page or the venue console's
 * sign-in form; the second decides whether `/dolmama/northern-avenue` — a real
 * venue and a real branch that are not each other's — answers with a page.
 */

let gateway: PublicGateway;

beforeEach(() => {
  gateway = createPublicMockGateway({
    gateway: createMockGateway({ latencyMs: 0, simulateJoiners: false }),
  });
});

describe('which app owns a URL', () => {
  it('sends a venue slug to the public page', () => {
    expect(isPublicPath('/lumen-coffee')).toBe(true);
    expect(isPublicPath('/lumen-coffee/northern-avenue')).toBe(true);
    expect(isPublicPath('/lumen-coffee/northern-avenue/booking/mbk_1')).toBe(true);
  });

  it('keeps the console and the counter screen', () => {
    for (const segment of RESERVED_FIRST_SEGMENTS) {
      expect(isPublicPath(`/${segment}`)).toBe(false);
      expect(isPublicPath(`/${segment}/anything`)).toBe(false);
    }
  });

  it('keeps the page a sign-in link opens', () => {
    // The only way a manager or owner ever gets a password is a link to this
    // path, pasted into a chat. Sent to the public page it would read as a
    // venue slug and answer "we could not find that place".
    expect(isPublicPath('/reset-password')).toBe(false);
    expect(isPublicPath('/reset-password/')).toBe(false);
  });

  it('leaves the root to the console', () => {
    // `/` is where a signed-in venue user lands. A public page always names a
    // venue, so there is nothing for this route group to show there.
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('')).toBe(false);
  });

  it('does not let case smuggle a reserved word past the check', () => {
    expect(isPublicPath('/Staff')).toBe(false);
    expect(isPublicPath('/PLATFORM/venues')).toBe(false);
  });
});

describe('resolving a venue and a branch by slug pair', () => {
  it('resolves a real pair', async () => {
    const branch = await gateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    });

    expect(branch).not.toBeNull();
    expect(branch?.venue.name).toBe('Lumen Coffee');
    expect(branch?.name).toBe('Northern Avenue');
    expect(branch?.timeZoneId).toBe('Asia/Yerevan');
  });

  it('404s a mismatched pairing, though both halves exist', async () => {
    /*
     * The important one. `dolmama` is a real venue and `northern-avenue` is a
     * real branch slug — of a different venue. Answering this would let anyone
     * enumerate a chain's locations by trying slugs against each other, and
     * *redirecting* to the right venue would be worse: a redirect confirms the
     * branch exists somewhere.
     */
    await expect(
      gateway.resolveBranch({ venueSlug: 'dolmama', branchSlug: 'northern-avenue' }),
    ).resolves.toBeNull();

    // And the pair each half really belongs to still works, so the test above
    // is about the pairing rather than about a typo in the fixture.
    await expect(
      gateway.resolveBranch({ venueSlug: 'dolmama', branchSlug: 'pushkin-street' }),
    ).resolves.not.toBeNull();
    await expect(
      gateway.resolveBranch({ venueSlug: 'lumen-coffee', branchSlug: 'northern-avenue' }),
    ).resolves.not.toBeNull();
  });

  it('404s an unknown slug on either side', async () => {
    await expect(
      gateway.resolveBranch({ venueSlug: 'no-such-venue', branchSlug: 'northern-avenue' }),
    ).resolves.toBeNull();
    await expect(
      gateway.resolveBranch({ venueSlug: 'lumen-coffee', branchSlug: 'no-such-branch' }),
    ).resolves.toBeNull();
  });

  it('resolves a suspended branch rather than hiding it', async () => {
    // Not null: the page has to be able to say "not available" plainly, which
    // it cannot do if a suspended branch is indistinguishable from a typo.
    const branch = await gateway.resolveBranch({
      venueSlug: 'dolmama',
      branchSlug: 'dalma-garden',
    });

    expect(branch?.status).toBe('suspended');
    // And it advertises nothing: a free-table count above a "not available"
    // notice is the platform selling a venue it has switched off.
    expect(branch?.freeTables).toBe(0);
    expect(branch?.acceptsWebBookings).toBe(false);
  });

  it('lists a chain by venue slug, with a free count per branch', async () => {
    const venue = await gateway.resolveVenue('lumen-coffee');

    expect(venue?.branches.map((branch) => branch.slug)).toEqual([
      'northern-avenue',
      'cascade',
      'saryan-street',
    ]);
    // The whole reason the chooser exists: "Lumen has 14 free" is useless if
    // they are all at the branch across town.
    expect(venue?.branches.every((branch) => Number.isInteger(branch.freeTables))).toBe(true);
    expect(venue?.branches.some((branch) => branch.freeTables > 0)).toBe(true);
  });

  it('returns null for a venue slug nobody has', async () => {
    await expect(gateway.resolveVenue('not-a-venue')).resolves.toBeNull();
  });
});
