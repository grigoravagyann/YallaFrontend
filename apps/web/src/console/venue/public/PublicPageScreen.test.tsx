// @vitest-environment jsdom
import { createConsoleMockGateway, ValidationError, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueLayout } from '../VenueLayout';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PublicPageScreen, phoneProblem } from './PublicPageScreen';

/**
 * The Public page (Public artboard): the page and booking form — the number,
 * the booking switch and the card's picture — saved on its own, beside the
 * app card as typed. None of the three could be set from the console before
 * the first version of this screen; the switch is a readiness line.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

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
  return harness;
}

async function pageForm(): Promise<HTMLElement> {
  return (await screen.findByRole(
    'form',
    { name: 'Page and booking' },
    { timeout: 5000 },
  )) as HTMLElement;
}

/** The error a field points at through `aria-describedby`, if any. */
function errorOf(field: HTMLElement): HTMLElement | null {
  const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/u);
  const id = ids.find((candidate) => candidate.endsWith('-err'));
  return id ? document.getElementById(id) : null;
}

describe('the public page screen', () => {
  it('loads what is published and saves the number and the switch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updatePublicProfile');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = within(await pageForm());
    const phone = form.getByLabelText(/phone/i) as HTMLInputElement;
    expect(phone.value).toBe('');
    const bookings = form.getByRole('switch', { name: /take bookings/i });
    // Seeded from the public fixture, as the server's seed does: this branch
    // already takes bookings on its public page, so the switch starts on.
    expect(bookings.getAttribute('aria-checked')).toBe('true');

    await user.type(phone, '+374 11 22 33 44');
    await user.click(bookings);
    expect(form.getByText('Unsaved changes')).toBeTruthy();
    await user.click(form.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].profile).toEqual({
      phoneE164: '+374 11 22 33 44',
      acceptsWebBookings: false,
      coverPhotoId: null,
    });
    expect(await form.findByText('Saved')).toBeTruthy();
    expect(screen.getByText('Page settings saved')).toBeTruthy();
    expect(form.queryByText('Unsaved changes')).toBeNull();
  });

  it('says a number that is not international before sending it, under the field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updatePublicProfile');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = within(await pageForm());
    const phone = form.getByLabelText(/phone/i);
    await user.type(phone, '011 22 33 44');
    await user.click(form.getByRole('button', { name: /^save$/i }));

    // The help under the field mentions +374 too, so the error is found by
    // the field's own reference to it rather than by its words.
    await waitFor(() => expect(errorOf(phone)?.textContent).toMatch(/must start with \+/u));
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(phone);
    expect(update).not.toHaveBeenCalled();
  });

  it("puts the server's refusal of the number under the field, not at the top", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    vi.spyOn(gateway, 'updatePublicProfile').mockRejectedValueOnce(
      new ValidationError({
        url: '/api/branches/b-lumen-cascade/public-profile',
        status: 400,
        problem: {
          type: 'about:blank',
          title: 'Invalid request',
          status: 400,
          detail: 'The phone number must be in E.164 format.',
          code: 'invalid-request',
          traceId: 'test',
          context: { field: 'phoneE164' },
        },
      }),
    );
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = within(await pageForm());
    const phone = form.getByLabelText(/phone/i);
    await user.type(phone, '+374 11 22 33 44');
    await user.click(form.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(errorOf(phone)).not.toBeNull());
    // The console's sentence, never the server's English.
    expect(errorOf(phone)?.textContent).not.toMatch(/E\.164/u);
    expect(screen.queryByText('Page settings saved')).toBeNull();
  });

  it('shows the cover photo the branch has, and keeps sending its id on save', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    // A cover already set, as a venue that onboarded last week has. The crop
    // and upload path itself is the menu picker's and is tested there; jsdom
    // has no canvas to crop with, so this pins the wiring on either side of it.
    const upload = await gateway.uploadPhoto({
      branchId: 'b-lumen-cascade',
      file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      fileName: 'front.png',
    });
    await gateway.updatePublicProfile({
      branchId: 'b-lumen-cascade',
      profile: { phoneE164: null, acceptsWebBookings: false, coverPhotoId: upload.photo.photoId },
    });
    const update = vi.spyOn(gateway, 'updatePublicProfile');
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = within(await pageForm());
    // The picker is the menu editor's, reused: a photo present shows the card
    // photo with a Change action rather than the empty drop zone.
    await form.findByRole('button', { name: /^change$/i });

    await user.click(form.getByRole('switch', { name: /take bookings/i }));
    await user.click(form.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].profile).toEqual({
      phoneE164: null,
      acceptsWebBookings: true,
      coverPhotoId: upload.photo.photoId,
    });
  });

  it("draws the app card beside the forms, following the typing, and names the page's link", async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const user = userEvent.setup();
    renderScreen(gateway);

    const form = within(await pageForm());
    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Book a table')).toBeTruthy();
    await user.click(form.getByRole('switch', { name: /take bookings/i }));
    expect(within(preview).getByText('Booking is closed')).toBeTruthy();

    const listing = within(
      await screen.findByRole('form', { name: 'In the Yalla app' }, { timeout: 5000 }),
    );
    const cuisine = listing.getByLabelText(/cuisine/i);
    await user.clear(cuisine);
    await user.type(cuisine, 'Grill and coffee');
    expect(within(preview).getByText('Grill and coffee')).toBeTruthy();

    const venue = await gateway.getManagedVenue('v-lumen');
    const branch = venue.branches.find((entry) => entry.id === 'b-lumen-cascade')!;
    const link = await screen.findByRole('link', {
      name: `${window.location.host}/${venue.slug}/${branch.slug}`,
    });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(preview).getByText(`${venue.name} · ${branch.name}`)).toBeTruthy();
  });
});

describe('the number check', () => {
  it("takes what the server's PhoneNumber.Normalise takes, and nothing else", () => {
    expect(phoneProblem('+374 (11) 22-33-44')).toBe(false);
    expect(phoneProblem('+37411223344')).toBe(false);
    expect(phoneProblem('')).toBe(false);
    // No country code starts with 0; seven digits are too few, sixteen too many.
    expect(phoneProblem('+0374 11 22 33 44')).toBe(true);
    expect(phoneProblem('+1234567')).toBe(true);
    expect(phoneProblem('+1234567890123456')).toBe(true);
    expect(phoneProblem('374 11 22 33 44')).toBe(true);
    expect(phoneProblem('+374 11 22 33 44 ext 5')).toBe(true);
  });
});
