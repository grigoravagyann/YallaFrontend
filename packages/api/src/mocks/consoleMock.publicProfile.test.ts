import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The public page's settings in the mock, including the venue card's picture.
 *
 * The server checks the photo before it writes anything, so a foreign id
 * refuses the whole form; the mock keeps that order so the screen can be
 * driven into it without a backend.
 */
describe('the public profile in the mock', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it('starts every branch with nothing published and no picture', async () => {
    const profile = await gateway.getPublicProfile('b-lumen-cascade');
    expect(profile).toEqual({ phoneE164: null, acceptsWebBookings: false, coverPhoto: null });
  });

  it('sets an uploaded photo as the cover and reads it back', async () => {
    const upload = await gateway.uploadPhoto({
      branchId: 'b-lumen-cascade',
      file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      fileName: 'front.png',
    });

    const saved = await gateway.updatePublicProfile({
      branchId: 'b-lumen-cascade',
      profile: {
        phoneE164: '+374 11 22 33 44',
        acceptsWebBookings: true,
        coverPhotoId: upload.photo.photoId,
      },
    });

    expect(saved.coverPhoto?.photoId).toBe(upload.photo.photoId);
    expect(saved.phoneE164).toBe('+37411223344');
    expect(saved.acceptsWebBookings).toBe(true);
    expect(await gateway.getPublicProfile('b-lumen-cascade')).toEqual(saved);

    const cleared = await gateway.updatePublicProfile({
      branchId: 'b-lumen-cascade',
      profile: { phoneE164: null, acceptsWebBookings: true, coverPhotoId: null },
    });
    expect(cleared.coverPhoto).toBeNull();
    expect(cleared.phoneE164).toBeNull();
  });

  it('takes every table off the photo when the cover changes or is cleared, as the server does', async () => {
    const branchId = 'b-lumen-cascade';
    const upload = async (fileName: string) =>
      (
        await gateway.uploadPhoto({
          branchId,
          file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
          fileName,
        })
      ).photo.photoId;
    const setCover = (coverPhotoId: string | null) =>
      gateway.updatePublicProfile({
        branchId,
        profile: { phoneE164: null, acceptsWebBookings: true, coverPhotoId },
      });
    // Pins go through their own route (K7), against the cover they were placed on.
    const placeEveryTable = async () => {
      const [plan, profile] = await Promise.all([
        gateway.getFloorPlan(branchId),
        gateway.getPublicProfile(branchId),
      ]);
      await gateway.saveTablePhotoPositions(branchId, {
        coverPhotoId: profile.coverPhoto!.photoId,
        positions: plan.tables
          .filter((t) => t.isActive)
          .map((t) => ({ tableId: t.id, photoX: 0.4, photoY: 0.6 })),
      });
    };
    const placed = async () =>
      (await gateway.getFloorPlan(branchId)).tables.filter(
        (t) => t.photoX != null || t.photoY != null,
      ).length;

    const front = await upload('front.png');
    const terrace = await upload('terrace.png');
    await setCover(front);
    await placeEveryTable();
    expect(await placed()).toBeGreaterThan(0);

    // The same cover sent again with the rest of the form keeps them.
    await setCover(front);
    expect(await placed()).toBeGreaterThan(0);

    await setCover(terrace);
    expect(await placed()).toBe(0);

    await placeEveryTable();
    await setCover(null);
    expect(await placed()).toBe(0);
  });

  it('refuses a photo it never stored, and leaves the form as it was', async () => {
    const caught = await gateway
      .updatePublicProfile({
        branchId: 'b-lumen-cascade',
        profile: {
          phoneE164: '+37411223344',
          acceptsWebBookings: true,
          coverPhotoId: 'photo-from-elsewhere',
        },
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(NotFoundError);
    expect(await gateway.getPublicProfile('b-lumen-cascade')).toEqual({
      phoneE164: null,
      acceptsWebBookings: false,
      coverPhoto: null,
    });
  });

  it('refuses a number that is not E.164 and names the field', async () => {
    const caught = await gateway
      .updatePublicProfile({
        branchId: 'b-lumen-cascade',
        profile: { phoneE164: '011 22 33 44', acceptsWebBookings: false, coverPhotoId: null },
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).problem?.context?.['field']).toBe('phoneE164');
  });
});
