// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueLayout } from '../VenueLayout';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PublicPageScreen } from './PublicPageScreen';

/**
 * The Public page tab: the number, the booking switch and the venue card's
 * picture. None of the three could be set from the console before this — the
 * switch is a readiness checklist line nobody could reach.
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

describe('the public page screen', () => {
  it('loads what is published and saves the number and the switch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const update = vi.spyOn(gateway, 'updatePublicProfile');
    const user = userEvent.setup();
    renderScreen(gateway);

    const phone = (await screen.findByLabelText(/phone/i)) as HTMLInputElement;
    expect(phone.value).toBe('');
    const bookings = screen.getByLabelText(/take bookings/i) as HTMLInputElement;
    expect(bookings.checked).toBe(false);

    await user.type(phone, '+374 11 22 33 44');
    await user.click(bookings);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].profile).toEqual({
      phoneE164: '+374 11 22 33 44',
      acceptsWebBookings: true,
      coverPhotoId: null,
    });
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
  });

  it('shows the refusal against the phone field, not at the top', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const user = userEvent.setup();
    renderScreen(gateway);

    const phone = await screen.findByLabelText(/phone/i);
    await user.type(phone, '011 22 33 44');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // The refusal is an alert; the help text under the field also mentions
    // +374, so match the role rather than the words.
    const refusal = await screen.findByRole('alert');
    expect(refusal.textContent).toMatch(/E\.164/u);
    // Attached to the input via aria-describedby, so a screen reader hears it there.
    expect(phone.getAttribute('aria-describedby')).toBe(refusal.id);
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

    // The picker is the menu editor's, reused: a photo present shows the card
    // preview with a Replace action rather than the empty drop zone.
    await screen.findByRole('button', { name: /replace/i });
    expect(document.querySelector('input[type="file"]')).toBeTruthy();

    await user.click(screen.getByLabelText(/take bookings/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0].profile).toEqual({
      phoneE164: null,
      acceptsWebBookings: true,
      coverPhotoId: upload.photo.photoId,
    });
  });
});
