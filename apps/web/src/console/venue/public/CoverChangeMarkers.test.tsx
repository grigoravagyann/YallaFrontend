// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway, type Photo } from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueLayout } from '../VenueLayout';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PublicPageScreen } from './PublicPageScreen';

/**
 * A new cover photo takes every table off the photo on the server. The pins
 * section must follow: no old pins drawn on the new picture, no unsaved draft
 * made on the old one carried over, and no save that puts either back.
 *
 * Its own file because the picker is replaced: choosing a cover for real means
 * cropping on a canvas, which jsdom does not have. The stub hands the form
 * whatever photo the test queued, as a finished crop and upload would.
 */

const picker = vi.hoisted(() => ({ next: null as Photo | null }));

vi.mock('../menu/PhotoPicker', async () => {
  const { createElement } = await import('react');
  return {
    PhotoPicker: ({ onChange }: { onChange: (photo: Photo) => void }) =>
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (picker.next) onChange(picker.next);
          },
        },
        'Use the queued photo',
      ),
  };
});

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  picker.next = null;
});

const BRANCH = 'b-lumen-cascade';

const owner = {
  id: 'v-lumen-owner',
  displayName: 'Aram Sargsyan',
  role: 'owner' as const,
  scope: { venueId: 'v-lumen', branchIds: [] },
};

function renderScreen(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<VenueLayout user={owner} />}>
          <Route path="public" element={<PublicPageScreen />} />
        </Route>
      </Routes>,
      '/venue/public',
    ),
  );
}

async function upload(gateway: ConsoleGateway, fileName: string): Promise<Photo> {
  const result = await gateway.uploadPhoto({
    branchId: BRANCH,
    file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    fileName,
  });
  return result.photo;
}

function setCover(gateway: ConsoleGateway, coverPhotoId: string | null) {
  return gateway.updatePublicProfile({
    branchId: BRANCH,
    profile: { phoneE164: null, acceptsWebBookings: false, coverPhotoId },
  });
}

/** A venue with a saved cover and table 2 already on it. */
async function venueWithPins(): Promise<{ gateway: ConsoleGateway; terrace: Photo }> {
  const gateway = createConsoleMockGateway({ latencyMs: 0 });
  const front = await upload(gateway, 'front.png');
  const terrace = await upload(gateway, 'terrace.png');
  await setCover(gateway, front.photoId);
  const plan = await gateway.getFloorPlan(BRANCH);
  await gateway.replaceFloorPlan({
    branchId: BRANCH,
    command: {
      floorWidth: plan.floorWidth,
      floorHeight: plan.floorHeight,
      areas: plan.areas,
      tables: plan.tables
        .filter((t) => t.isActive)
        .map((t) =>
          t.label === '2'
            ? { ...t, floorAreaName: null, photoX: 0.5, photoY: 0.5 }
            : { ...t, floorAreaName: null },
        ),
    },
  });
  return { gateway, terrace };
}

async function stage() {
  const element = await screen.findByTestId('marker-stage');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
  return element;
}

/** Places table 3 without saving it. */
async function draftTableThree(user: ReturnType<typeof userEvent.setup>) {
  const element = await stage();
  await user.click(screen.getByRole('button', { name: /table 3 · not placed/i }));
  fireEvent.pointerDown(element, { clientX: 50, clientY: 75, pointerId: 1 });
  await screen.findByRole('button', { name: /^table 3$/i });
}

describe('changing the cover photo under the table pins', () => {
  it('drops the old pins and the unsaved draft, says so, and a later pin save cannot bring them back', async () => {
    const { gateway, terrace } = await venueWithPins();
    const user = userEvent.setup();
    renderScreen(gateway);

    await draftTableThree(user);
    expect(screen.getByRole('button', { name: /^table 2$/i })).toBeTruthy();

    // The cover picker is the form's, above the listing's gallery picker.
    picker.next = terrace;
    await user.click(screen.getAllByRole('button', { name: /use the queued photo/i })[0]!);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await screen.findByText(/pin changes you had not saved were discarded/i);
    const fresh = await stage();
    expect(fresh.querySelector('img')?.getAttribute('src')).toBe(
      terrace.fullUrl || terrace.cardUrl,
    );
    expect(screen.queryByRole('button', { name: /^table 2$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^table 3$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /table 2 · not placed/i })).toBeTruthy();

    // Placing a table on the new picture clears the notice, and its save
    // carries no position made on the old one.
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    await user.click(screen.getByRole('button', { name: /table 5 · not placed/i }));
    fireEvent.pointerDown(fresh, { clientX: 100, clientY: 50, pointerId: 1 });
    expect(screen.queryByText(/pin changes you had not saved were discarded/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /save positions/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const tables = replace.mock.calls[0]?.[0].command.tables ?? [];
    expect(tables.filter((t) => t.photoX != null).map((t) => t.label)).toEqual(['5']);
    await screen.findByText(/positions saved/i);
  });

  it('keeps the pins and the draft when the form is saved with the same cover', async () => {
    const { gateway } = await venueWithPins();
    const user = userEvent.setup();
    renderScreen(gateway);

    await draftTableThree(user);
    await user.click(screen.getByLabelText(/take bookings/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(screen.getAllByText(/^saved/i).length).toBeGreaterThan(0));

    expect(screen.getByRole('button', { name: /^table 2$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^table 3$/i })).toBeTruthy();
    expect(screen.queryByText(/discarded/i)).toBeNull();
  });

  it('refuses a pin save when the cover was changed in another tab, and reads it again', async () => {
    const { gateway, terrace } = await venueWithPins();
    const user = userEvent.setup();
    renderScreen(gateway);

    await draftTableThree(user);

    // Meanwhile, in another tab, somebody saves a new cover.
    await setCover(gateway, terrace.photoId);
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');

    await user.click(screen.getByRole('button', { name: /save positions/i }));

    await screen.findByText(/the floor plan was refused/i);
    await screen.findByText(/pin changes you had not saved were discarded/i);
    expect(replace).not.toHaveBeenCalled();

    // Read again: the new picture, and the room with nothing on it.
    const fresh = await stage();
    expect(fresh.querySelector('img')?.getAttribute('src')).toBe(
      terrace.fullUrl || terrace.cardUrl,
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: /^table 2$/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /^table 3$/i })).toBeNull();
  });
});
