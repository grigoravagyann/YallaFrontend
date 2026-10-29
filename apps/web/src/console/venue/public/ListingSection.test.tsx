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
 * The Public page's diner app listing section ("In the Time to Eat app", Public
 * artboard). (The table pins that shared this file moved to the rooms editor,
 * with their tests.)
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

/** The error a field points at through `aria-describedby`, if any. */
function errorOf(field: HTMLElement): HTMLElement | null {
  const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/u);
  const id = ids.find((candidate) => candidate.endsWith('-err'));
  return id ? document.getElementById(id) : null;
}

async function listingForm(): Promise<HTMLElement> {
  return (await screen.findByRole(
    'form',
    { name: /in the time to eat app/i },
    { timeout: 5000 },
  )) as HTMLElement;
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
    // Three gallery photos already saved; the crop-and-upload path is the menu
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

    const form = await listingForm();
    const scoped = within(form);

    await user.type(scoped.getByLabelText(/cuisine/i), 'Armenian');
    await user.click(scoped.getByRole('button', { name: /moderate/i }));
    await user.click(scoped.getByRole('checkbox', { name: /wi-fi/i }));
    await user.click(scoped.getByRole('checkbox', { name: /parking/i }));
    await user.type(scoped.getByLabelText(/website/i), 'https://lumen.am');

    const latitude = scoped.getByLabelText(/latitude/i);
    await user.clear(latitude);
    await user.type(latitude, '40.2');

    await user.click(scoped.getByRole('button', { name: 'Photo 1: move later' }));
    await user.click(scoped.getByRole('button', { name: 'Remove photo 3' }));
    // Taken out of the gallery with a way back, until the listing is saved.
    expect(await screen.findByText(/Photo 3 removed/u)).toBeTruthy();
    expect(scoped.getByText('Unsaved changes')).toBeTruthy();

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
      // Untouched, so sent back as stored: every field is replaced on save.
      district: current.district,
      latitude: 40.2,
      longitude: current.longitude,
    });
    expect(await scoped.findByText('Listing saved')).toBeTruthy();
    expect(screen.getByText('The app listing is saved')).toBeTruthy();
  });

  it('puts a removed gallery photo back from the toast', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photo = await uploadTo(gateway, 'a.png', 3);
    const current = await gateway.getBranchListing(BRANCH);
    await gateway.updateBranchListing({
      branchId: BRANCH,
      listing: { ...current, galleryPhotoIds: [photo] },
    });
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    await user.click(within(form).getByRole('button', { name: 'Remove photo 1' }));
    expect(within(form).queryByRole('img', { name: 'Gallery photo 1' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(form).getByRole('img', { name: 'Gallery photo 1' })).toBeTruthy();
    expect(within(form).queryByText('Unsaved changes')).toBeNull();
  });

  it('puts a removed photo back where it was, keeping what changed since, and keeps the focus in the gallery', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const first = await uploadTo(gateway, 'a.png', 3);
    const second = await uploadTo(gateway, 'b.png', 4);
    const third = await uploadTo(gateway, 'c.png', 5);
    const current = await gateway.getBranchListing(BRANCH);
    await gateway.updateBranchListing({
      branchId: BRANCH,
      listing: { ...current, galleryPhotoIds: [first, second, third] },
    });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    await user.click(within(form).getByRole('button', { name: 'Remove photo 1' }));
    // The photo that took its place has the focus, not the page.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(form).getByRole('button', { name: 'Remove photo 1' }),
      ),
    );
    // A change after the removal: the last two swap.
    await user.click(within(form).getByRole('button', { name: 'Photo 1: move later' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].listing.galleryPhotoIds).toEqual([first, third, second]);
  });

  it('lets an owner move the branch: a new address and pin are saved and shown', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const scoped = within(await listingForm());
    const address = scoped.getByLabelText(/street address/i) as HTMLInputElement;
    expect(address.readOnly).toBe(false);
    expect(scoped.queryByText(/only the owner can move/i)).toBeNull();

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
    await scoped.findByText('Listing saved');
    expect((scoped.getByLabelText(/street address/i) as HTMLInputElement).value).toBe(
      '1 Test Street, Yerevan',
    );
    expect((await gateway.getBranchListing(BRANCH)).address).toBe('1 Test Street, Yerevan');
  });

  it('shows a manager the pin and the address read-only, and says who can change them', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    renderScreen(gateway, manager);

    const scoped = within(await listingForm());
    // Read-only rather than disabled: still read out, and still there to copy.
    expect((scoped.getByLabelText(/street address/i) as HTMLInputElement).readOnly).toBe(true);
    expect((scoped.getByLabelText(/latitude/i) as HTMLInputElement).readOnly).toBe(true);
    expect((scoped.getByLabelText(/longitude/i) as HTMLInputElement).readOnly).toBe(true);
    expect(scoped.getByText(/only the owner can move the map pin/i)).toBeTruthy();
    // The rest of the listing is still theirs to edit, the district included:
    // it names the area, it does not move the pin.
    expect((scoped.getByLabelText(/cuisine/i) as HTMLInputElement).readOnly).toBe(false);
    expect((scoped.getByLabelText(/district/i) as HTMLInputElement).readOnly).toBe(false);
  });

  it('lets a manager set the district, trimmed, and clear it again', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'manager' });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway, manager);

    const scoped = within(await listingForm());
    const district = scoped.getByLabelText(/district/i) as HTMLInputElement;
    await user.clear(district);
    await user.type(district, '  Kentron  ');
    await user.click(scoped.getByRole('button', { name: /save listing/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].listing.district).toBe('Kentron');
    await scoped.findByText('Listing saved');
    expect(district.value).toBe('Kentron');
    expect((await gateway.getBranchListing('b-lumen-north')).district).toBe('Kentron');

    // Blank is "no district", not an empty string the app would draw.
    await user.clear(district);
    await user.type(district, '   ');
    await user.click(scoped.getByRole('button', { name: /save listing/i }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]?.[0].listing.district).toBeNull();
    await waitFor(async () =>
      expect((await gateway.getBranchListing('b-lumen-north')).district).toBeNull(),
    );
  });

  it('says a district is too long before sending anything, with the cursor on it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const district = within(form).getByLabelText(/district/i);
    await user.clear(district);
    // Pasted, as a long name usually arrives; the input does not cut it short.
    await user.click(district);
    await user.paste('K'.repeat(61));
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    await waitFor(() =>
      expect(errorOf(district)?.textContent).toMatch(/district can be at most 60 characters/i),
    );
    expect(district.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(district);
    // The foot says the save did not happen.
    expect(within(form).getByRole('alert').textContent).toMatch(/check the fields/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('puts a 422 that names the district under the district', async () => {
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
              { field: 'district', message: 'At most 60 characters.', bound: 'max', max: 60 },
            ],
          },
        },
      }),
    );
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    const district = within(form).getByLabelText(/district/i);
    await waitFor(() =>
      expect(errorOf(district)?.textContent).toMatch(/district can be at most 60 characters/i),
    );
    expect(within(form).queryByText(/did not save/i)).toBeNull();
  });

  it('asks for the address with the pin before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const address = within(form).getByLabelText(/street address/i);
    await user.clear(address);
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    await waitFor(() =>
      expect(errorOf(address)?.textContent).toMatch(/address together with the map pin/i),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses one coordinate without the other before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const longitude = within(form).getByLabelText(/longitude/i);
    await user.clear(longitude);
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    await waitFor(() =>
      expect(errorOf(longitude)?.textContent).toMatch(/both latitude and longitude/i),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('says a coordinate is out of range, or not a number, before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const latitude = within(form).getByLabelText(/latitude/i);
    const longitude = within(form).getByLabelText(/longitude/i);
    const save = within(form).getByRole('button', { name: /save listing/i });

    // Swapped, as a hurried copy from a map app does.
    await user.clear(latitude);
    await user.type(latitude, '144.5129');
    await user.clear(longitude);
    await user.type(longitude, '40.1843');
    await user.click(save);
    await waitFor(() => expect(errorOf(latitude)?.textContent).toMatch(/between -90 and 90/i));

    await user.clear(latitude);
    await user.type(latitude, '40.1.2');
    await user.click(save);
    await waitFor(() => expect(errorOf(latitude)?.textContent).toMatch(/decimal number/i));
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

    const form = await listingForm();
    await user.click(within(form).getByRole('button', { name: /save listing/i }));

    const latitude = within(form).getByLabelText(/latitude/i);
    await waitFor(() => expect(errorOf(latitude)?.textContent).toMatch(/between -90 and 90/i));
    expect(within(form).queryByText(/did not save/i)).toBeNull();
  });

  it('says a website without http:// or https:// is not one, before sending anything', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updateBranchListing');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const website = within(form).getByLabelText(/website/i);
    await user.type(website, 'lumen');
    fireEvent.submit(form);

    await waitFor(() =>
      expect(errorOf(website)?.textContent).toMatch(/must start with http:\/\/ or https:\/\//i),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('counts the cuisine as it is typed, red once over', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = await listingForm();
    const cuisine = within(form).getByLabelText(/cuisine/i);
    await user.clear(cuisine);
    await user.click(cuisine);
    await user.paste('x'.repeat(121));
    const counter = within(form).getByText('121 / 120');
    expect(counter.classList.contains('is-over')).toBe(true);
    expect(cuisine.getAttribute('aria-describedby')).toContain(counter.id);
    expect(cuisine.getAttribute('aria-invalid')).toBe('true');
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
      const form = (await screen.findByRole(
        'form',
        { name: i18next.t('publicPage.listing.title', { lng: 'hy', ns: 'admin' }) },
        { timeout: 5000 },
      )) as HTMLFormElement;
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
