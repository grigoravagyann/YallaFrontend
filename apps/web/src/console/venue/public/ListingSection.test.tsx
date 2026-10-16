// @vitest-environment jsdom
import { createConsoleMockGateway, ValidationError, type ConsoleGateway } from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueLayout } from '../VenueLayout';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PublicPageScreen } from './PublicPageScreen';

/**
 * The Public page's diner app listing section. (The table pins that shared
 * this file moved to the rooms editor, with their tests.)
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

const manager = {
  id: 'b-lumen-north-manager',
  displayName: 'Nare Petrosyan',
  role: 'manager' as const,
  scope: { venueId: 'v-lumen', branchIds: ['b-lumen-north'] },
};

function renderScreen(gateway: ConsoleGateway, user: typeof owner | typeof manager = owner) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<VenueLayout user={user} />}>
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
  it('saves cuisine, price level, amenities, the pin with its address, and the gallery order', async () => {
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
      // The address travels with the pin, as the server requires (K5).
      address: current.address,
      latitude: 40.2,
      longitude: current.longitude,
    });
    await screen.findByText(/listing saved/i);
  });

  it('lets an owner move the branch: a new address and pin are saved and shown', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    const scoped = within(form);
    const address = scoped.getByLabelText(/street address/i) as HTMLInputElement;
    expect(address.disabled).toBe(false);
    expect(scoped.queryByText(/only an owner can move/i)).toBeNull();

    await user.clear(address);
    await user.type(address, '1 Test Street, Yerevan');
    const latitude = scoped.getByLabelText(/latitude/i);
    const longitude = scoped.getByLabelText(/longitude/i);
    await user.clear(latitude);
    await user.type(latitude, '40.19');
    await user.clear(longitude);
    await user.type(longitude, '44.52');
    await user.click(scoped.getByRole('button', { name: /save listing/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].listing).toMatchObject({
      address: '1 Test Street, Yerevan',
      latitude: 40.19,
      longitude: 44.52,
    });
    await screen.findByText(/listing saved/i);
    expect((scoped.getByLabelText(/street address/i) as HTMLInputElement).value).toBe(
      '1 Test Street, Yerevan',
    );
    expect((await gateway.getBranchListing(BRANCH)).address).toBe('1 Test Street, Yerevan');
  });

  it('shows a manager the pin and the address read-only, and says who can change them', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    renderScreen(gateway, manager);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    const scoped = within(form);
    expect((scoped.getByLabelText(/street address/i) as HTMLInputElement).disabled).toBe(true);
    expect((scoped.getByLabelText(/latitude/i) as HTMLInputElement).disabled).toBe(true);
    expect((scoped.getByLabelText(/longitude/i) as HTMLInputElement).disabled).toBe(true);
    expect(scoped.getByText(/only an owner can move the map pin/i)).toBeTruthy();
    // The rest of the listing is still theirs to edit.
    expect((scoped.getByLabelText(/cuisine/i) as HTMLInputElement).disabled).toBe(false);
  });

  it('asks for the address with the pin before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    await user.clear(within(form).getByLabelText(/street address/i));
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    const refusal = await within(form).findByRole('alert');
    expect(refusal.textContent).toMatch(/address together with the map pin/i);
    expect(update).not.toHaveBeenCalled();
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

  it('says a coordinate is out of range, or not a number, before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    const latitude = within(form).getByLabelText(/latitude/i);
    const longitude = within(form).getByLabelText(/longitude/i);
    const save = within(form).getByRole('button', { name: /save listing/i });

    // Swapped, as a hurried copy from a map app does.
    await user.clear(latitude);
    await user.type(latitude, '144.5129');
    await user.clear(longitude);
    await user.type(longitude, '40.1843');
    await user.click(save);
    expect((await within(form).findByRole('alert')).textContent).toMatch(/between -90 and 90/i);

    await user.clear(latitude);
    await user.type(latitude, '40.1.2');
    await user.click(save);
    await waitFor(() =>
      expect(within(form).getByRole('alert').textContent).toMatch(/decimal number/i),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('puts a 400 that names one coordinate under the pin, not a generic failure', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    // What `Branch.Relocate`'s guard answers: one field, no collected list.
    vi.spyOn(gateway, 'updateBranchListing').mockRejectedValueOnce(
      new ValidationError({
        url: `/api/branches/${BRANCH}/listing`,
        status: 400,
        problem: {
          type: 'about:blank',
          title: 'Invalid request',
          status: 400,
          detail: 'longitude is out of range.',
          code: 'invalid-request',
          traceId: 'test',
          context: { field: 'longitude', value: 200 },
        },
      }),
    );
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = (await screen.findByRole('form', { name: /in the yalla app/i })) as HTMLElement;
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    const refusal = await within(form).findByRole('alert');
    expect(refusal.textContent).toMatch(/between -90 and 90/i);
    expect(
      within(form)
        .getByLabelText(/latitude/i)
        .getAttribute('aria-describedby'),
    ).toBe(refusal.id);
    expect(within(form).queryByText(/did not save/i)).toBeNull();
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
    // The console's sentence, not the server's English.
    expect(refusal.textContent).toMatch(/must start with http:\/\/ or https:\/\//i);
    expect(website.getAttribute('aria-describedby')).toBe(refusal.id);
  });

  it('renders refusals in the reader’s language and never the server’s English', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'updateBranchListing').mockRejectedValueOnce(
      new ValidationError({
        url: `/api/branches/${BRANCH}/listing`,
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'One or more fields are invalid.',
          code: 'validation-failed',
          traceId: 'test',
          context: {
            fields: [
              {
                field: 'priceLevel',
                message: 'The price level is 1 to 4.',
                bound: 'range',
                min: 1,
                max: 4,
              },
              { field: 'websiteUrl', message: 'The website must be an http or https address.' },
            ],
          },
        },
      }),
    );

    await i18next.changeLanguage('hy');
    try {
      renderScreen(gateway);
      const form = await waitFor(() => {
        const found = document.querySelector<HTMLFormElement>('form.listing-form');
        expect(found).not.toBeNull();
        return found!;
      });
      fireEvent.submit(form);

      const price = i18next.t('publicPage.listing.errors.priceLevel.range', {
        lng: 'hy',
        ns: 'admin',
        min: 1,
        max: 4,
      });
      const website = i18next.t('publicPage.listing.errors.websiteUrl.scheme', {
        lng: 'hy',
        ns: 'admin',
      });
      // Really Armenian copy, not an English fallback that happens to match.
      expect(website).not.toBe(
        i18next.t('publicPage.listing.errors.websiteUrl.scheme', { lng: 'en', ns: 'admin' }),
      );

      expect(await within(form).findByText(price)).toBeTruthy();
      expect(within(form).getByText(website)).toBeTruthy();
      expect(form.textContent).not.toContain('The website');
      expect(form.textContent).not.toContain('The price level');
    } finally {
      await i18next.changeLanguage('en');
    }
  });
});
