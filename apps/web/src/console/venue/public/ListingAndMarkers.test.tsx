// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueLayout } from '../VenueLayout';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PublicPageScreen } from './PublicPageScreen';

/**
 * The Public page's two new sections: the diner app listing and the table
 * pins on the cover photo.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

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

async function uploadTo(gateway: ConsoleGateway, fileName: string, size: number) {
  const upload = await gateway.uploadPhoto({
    branchId: BRANCH,
    file: new Blob([new Uint8Array(size)], { type: 'image/png' }),
    fileName,
  });
  return upload.photo.photoId;
}

describe('the listing section', () => {
  it('saves cuisine, price level, amenities, the pin and the gallery order', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    // Two gallery photos already saved; the crop-and-upload path is the menu
    // picker's and jsdom has no canvas, so this pins the ordering and removal.
    const first = await uploadTo(gateway, 'a.png', 3);
    const second = await uploadTo(gateway, 'b.png', 4);
    const third = await uploadTo(gateway, 'c.png', 5);
    const current = await gateway.getBranchListing(BRANCH);
    await gateway.updateBranchListing({
      branchId: BRANCH,
      listing: {
        ...current,
        galleryPhotoIds: [first, second, third],
        latitude: current.latitude,
        longitude: current.longitude,
      },
    });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    const scoped = within(form);

    await user.type(scoped.getByLabelText(/cuisine/i), 'Armenian');
    await user.click(scoped.getByRole('button', { name: /moderate/i }));
    await user.click(scoped.getByRole('button', { name: /wi-fi/i }));
    await user.click(scoped.getByRole('button', { name: /parking/i }));
    await user.type(scoped.getByLabelText(/website/i), 'https://lumen.am');

    const latitude = scoped.getByLabelText(/latitude/i);
    await user.clear(latitude);
    await user.type(latitude, '40.2');

    await user.click(scoped.getByRole('button', { name: /move later \(1\)/i }));
    await user.click(scoped.getByRole('button', { name: /remove \(3\)/i }));

    await user.click(scoped.getByRole('button', { name: /save listing/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].listing).toEqual({
      cuisine: 'Armenian',
      about: null,
      priceLevel: 2,
      websiteUrl: 'https://lumen.am',
      amenities: ['wifi', 'parking'],
      galleryPhotoIds: [second, first],
      latitude: 40.2,
      longitude: current.longitude,
    });
    await screen.findByText(/listing saved/i);
  });

  it('refuses one coordinate without the other before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    await user.clear(within(form).getByLabelText(/longitude/i));
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    const refusal = await within(form).findByRole('alert');
    expect(refusal.textContent).toMatch(/both latitude and longitude/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('puts server refusals under the fields they name', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    const website = within(form).getByLabelText(/website/i);
    await user.type(website, 'lumen');
    // type="url" would block native submission in a browser; jsdom lets the
    // click through, which is what lets the server's refusal be seen here.
    fireEvent.submit(form);

    const refusal = await within(form).findByRole('alert');
    expect(refusal.textContent).toMatch(/http or https/i);
    expect(website.getAttribute('aria-describedby')).toBe(refusal.id);
  });
});

describe('the table pins on the cover photo', () => {
  it('asks for a saved cover first', async () => {
    renderScreen(createConsoleMockGateway({ latencyMs: 0 }));
    await screen.findByText(/save a cover photo above first/i);
  });

  it('places the selected table where the photo is clicked, clears one, and saves', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const cover = await uploadTo(gateway, 'front.png', 3);
    await gateway.updatePublicProfile({
      branchId: BRANCH,
      profile: { phoneE164: null, acceptsWebBookings: false, coverPhotoId: cover },
    });
    // Table 2 already placed, as a venue that did this last week has.
    const plan = await gateway.getFloorPlan(BRANCH);
    await gateway.replaceFloorPlan({
      branchId: BRANCH,
      command: {
        floorWidth: plan.floorWidth,
        floorHeight: plan.floorHeight,
        areas: plan.areas,
        tables: plan.tables.map((t) =>
          t.label === '2' ? { ...t, photoX: 0.5, photoY: 0.5 } : { ...t, floorAreaName: null },
        ),
      },
    });
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderScreen(gateway);

    const stage = await screen.findByTestId('marker-stage');
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;

    // The first unplaced table is picked to start with.
    await user.click(screen.getByRole('button', { name: /table 3 · not placed/i }));
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 75, pointerId: 1 });
    expect(await screen.findByRole('button', { name: /^table 3$/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /take off photo \(2\)/i }));
    expect(screen.queryByRole('button', { name: /^table 2$/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /save positions/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const tables = replace.mock.calls[0]?.[0].command.tables ?? [];
    expect(tables.find((t) => t.label === '3')).toMatchObject({ photoX: 0.25, photoY: 0.75 });
    expect(tables.find((t) => t.label === '2')).toMatchObject({ photoX: null, photoY: null });
    // The rest of the room goes back as it was.
    expect(tables).toHaveLength(plan.tables.filter((t) => t.isActive).length);
    await screen.findByText(/positions saved/i);
  });
});
