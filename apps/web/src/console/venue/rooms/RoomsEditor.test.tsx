// @vitest-environment jsdom
import {
  NetworkError,
  ValidationError,
  createConsoleMockGateway,
  type ConsoleGateway,
  type EditorFloorPlan,
  type Photo,
} from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { RoomsEditor } from './RoomsEditor';

/**
 * The rooms editor against the console mock, which answers the plan save
 * the way the server does.
 *
 * The photo picker is replaced: choosing a photo for real means cropping on a
 * canvas, which jsdom does not have. The stub hands the editor whatever photo
 * the test queued, as a finished crop and upload would.
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

async function upload(gateway: ConsoleGateway, name: string): Promise<Photo> {
  const { photo } = await gateway.uploadPhoto({
    branchId: BRANCH,
    file: new Blob([new Uint8Array([1, 2, name.length])], { type: 'image/png' }),
    fileName: name,
  });
  return photo;
}

/** The first room gets one photo, and table 2 (never used) and table 1 (with history) pins on it. */
async function seededGateway() {
  const gateway = createConsoleMockGateway({ latencyMs: 0 });
  const photo = await upload(gateway, 'windows.png');
  const plan = await gateway.getFloorPlan(BRANCH);
  const room = plan.areas[0]!;
  await gateway.replaceFloorPlan({
    branchId: BRANCH,
    command: {
      expectedVersion: plan.version,
      areas: plan.areas.map((area) => ({
        id: area.id,
        name: area.name,
        displayOrder: area.displayOrder,
        photoIds: area.id === room.id ? [photo.photoId] : [],
      })),
      tables: plan.tables.map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        floorAreaName: plan.areas.find((area) => area.id === table.floorAreaId)?.name ?? null,
        isBookable: table.isBookable,
        pin:
          table.label === '1' || table.label === '2'
            ? { photoId: photo.photoId, x: table.label === '1' ? 0.25 : 0.5, y: 0.5 }
            : null,
      })),
    },
  });
  return { gateway, photo, room };
}

function renderEditor(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  render(harness.wrap(<RoomsEditor branchId={BRANCH} />, '/venue/floorplan'));
  return harness;
}

async function stage() {
  const element = await screen.findByTestId('room-stage');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
  return element;
}

describe('the rooms editor', () => {
  it('adds a room and a photo, adds a table where the photo is clicked, and saves them together', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    picker.next = await upload(gateway, 'vip.png');
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'VIP');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    expect(screen.getByRole('heading', { name: 'VIP' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /use the queued photo/i }));
    fireEvent.pointerDown(await stage(), { clientX: 50, clientY: 25, pointerId: 1 });

    const form = screen.getByRole('form', { name: /new table/i });
    const label = within(form).getByLabelText(/label/i);
    expect((label as HTMLInputElement).value).toBe('13');
    await user.clear(within(form).getByLabelText(/seats/i));
    await user.type(within(form).getByLabelText(/seats/i), '6');
    await user.click(within(form).getByRole('button', { name: /add the table/i }));
    expect(screen.getByRole('button', { name: /^table 13 · not saved yet$/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    await screen.findByText(/rooms saved/i);

    const command = replace.mock.calls[0]![0].command;
    expect(command.areas.at(-1)).toEqual({
      name: 'VIP',
      displayOrder: 3,
      photoIds: [picker.next!.photoId],
    });
    expect(command.tables.find((table) => table.label === '13')).toEqual({
      label: '13',
      seats: 6,
      floorAreaName: 'VIP',
      isBookable: true,
      pin: { photoId: picker.next!.photoId, x: 0.25, y: 0.25 },
    });
    // Saved: the server's own room and pin come back.
    const saved = await gateway.getFloorPlan(BRANCH);
    expect(saved.tables.find((table) => table.label === '13')?.pin).toEqual({
      photoId: picker.next!.photoId,
      x: 0.25,
      y: 0.25,
    });
  });

  it('warns about bookable tables on no photo, and stops once one is not bookable', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const warning = await screen.findByTestId('unpinned-warning');
    expect(warning.textContent).toMatch(
      /^Tables 3, 4, .*, 12 can be booked but are on no photo, so diners cannot see or book them\.$/u,
    );
    expect(warning.textContent).not.toMatch(/\b1, 2\b/u);

    await user.click(screen.getByRole('button', { name: /tables in no room|table 3/i }));
  });

  it('draws pins in the live palette, and a new table in none of it', async () => {
    const { gateway } = await seededGateway();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · free$/i });
    expect(pin.className).toMatch(/\bis-free\b/u);
    await stage();
  });

  it('moves a selected pin with the arrow keys and takes it off the photo with Delete', async () => {
    const { gateway, photo } = await seededGateway();
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · free$/i });
    pin.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}');
    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    await screen.findByText(/rooms saved/i);
    expect(replace.mock.calls[0]![0].command.tables.find((t) => t.label === '2')?.pin).toEqual({
      photoId: photo.photoId,
      x: 0.51,
      y: 0.55,
    });

    const moved = await screen.findByRole('button', { name: /^table 2 · free$/i });
    moved.focus();
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('button', { name: /^table 2 · free$/i })).toBeNull();
    expect(screen.getByTestId('unpinned-warning').textContent).toMatch(/\b2, 3\b/u);
  });

  it('drags a pin to where the pointer lets go', async () => {
    const { gateway, photo } = await seededGateway();
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    await stage();
    const pin = await screen.findByRole('button', { name: /^table 2 · free$/i });
    fireEvent.pointerDown(pin, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(pin, { clientX: 150, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(pin, { pointerId: 1 });

    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    await screen.findByText(/rooms saved/i);
    expect(replace.mock.calls[0]![0].command.tables.find((t) => t.label === '2')?.pin).toEqual({
      photoId: photo.photoId,
      x: 0.75,
      y: 0.2,
    });
  });

  it('places a selected table with no pin where the photo is clicked', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const list = await screen.findByRole('region', { name: /not on a photo/i });
    await user.click(within(list).getByRole('button', { name: /^table 3$/i }));
    expect(screen.getByText(/click where table 3 stands to place it/i)).toBeTruthy();
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });

    expect(screen.getByRole('button', { name: /^table 3 · free$/i })).toBeTruthy();
    expect(screen.queryByRole('form', { name: /new table/i })).toBeNull();
  });

  it('takes the pins off a removed photo, and a deleted room leaves its tables in no room', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    await user.click(screen.getByRole('button', { name: /^remove \(1\)$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /remove it/i }),
    );
    expect(screen.queryByTestId('room-stage')).toBeNull();
    expect(screen.getByTestId('unpinned-warning').textContent).toMatch(/^Tables 1, 2, 3/u);

    await user.click(screen.getByRole('button', { name: /delete the room/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/its 4 tables stay, with no room and no pin/i);
    await user.click(within(dialog).getByRole('button', { name: /delete it/i }));

    expect(screen.queryByRole('heading', { name: room.name })).toBeNull();
    const noRoom = screen.getByRole('region', { name: /tables in no room/i });
    expect(within(noRoom).getAllByRole('button')).toHaveLength(4);
  });

  it('deletes a never-used table, and takes one with history out of service, saying which', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    let dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/never been used, so it is removed for good/i);
    await user.click(within(dialog).getByRole('button', { name: /delete it/i }));
    await screen.findByText('Table 2 was removed.');
    expect(screen.queryByRole('button', { name: /^table 2 · free$/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^table 1 · free$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/kept for the records and taken out of service/i);
    await user.click(within(dialog).getByRole('button', { name: /delete it/i }));
    await screen.findByText(/table 1 has history, so it was taken out of service/i);

    const out = screen.getByRole('complementary', { name: /out of service/i });
    expect(within(out).getByText('Table 1')).toBeTruthy();
    // Done on the server already: nothing is waiting to be saved.
    expect(
      (screen.getByRole('button', { name: /save rooms/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const plan = await gateway.getFloorPlan(BRANCH);
    expect(plan.tables.find((t) => t.label === '1')?.isActive).toBe(false);
    expect(plan.tables.some((t) => t.label === '2')).toBe(false);

    await user.click(within(out).getByRole('button', { name: /put it back in service/i }));
    expect(
      (screen.getByRole('button', { name: /save rooms/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('refuses a save somebody else got in before, and reloads the newer plan on request', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));

    // Another tab adds a room: the room routes move the version too.
    await gateway.createFloorArea({ branchId: BRANCH, name: 'Cellar', displayOrder: 7 });

    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toMatch(/someone else changed the rooms/i);

    await user.click(within(notice).getByRole('button', { name: /reload the rooms/i }));
    await waitFor(() => expect(screen.queryByText(/someone else changed the rooms/i)).toBeNull());
    expect(screen.getByRole('button', { name: /^cellar · 0 photos$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^garden/i })).toBeNull();
  });

  it("names the room and the table a photo or pin refusal is about, in the reader's language", async () => {
    const { gateway } = await seededGateway();
    vi.spyOn(gateway, 'replaceFloorPlan').mockRejectedValue(
      new ValidationError({
        url: '/floor-plan',
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'English the reader never sees.',
          code: 'validation-failed',
          traceId: 't',
          context: {
            fields: [
              { field: 'areas[0].photoIds[0]', message: 'x', bound: 'conflict' },
              { field: 'tables[1].photoId', message: 'x', bound: 'conflict' },
              { field: 'tables[0].photoX', message: 'x', bound: 'range' },
            ],
          },
        },
      }),
    );
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));

    const alert = await screen.findByRole('alert');
    const plan = await gateway.getFloorPlan(BRANCH);
    expect(alert.textContent).toContain(
      `A photo of ${plan.areas[0]!.name} is also in another room, or twice in this one.`,
    );
    expect(alert.textContent).toContain('Table 2 is pinned on another room');
    expect(alert.textContent).toContain("Table 1's pin is incomplete or off the photo.");
    expect(alert.textContent).not.toContain('English the reader never sees');
  });
});

describe('the rooms editor, from review', () => {
  it('keeps a regenerated QR in the cached plan, so reopening the editor never shows the dead one', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    const harness = renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));
    const before = screen.getByTestId('qr-token').textContent;
    await user.click(screen.getByRole('button', { name: /regenerate the qr/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/type 2 to confirm/i), '2');
    await user.click(within(dialog).getByRole('button', { name: /regenerate it/i }));
    await screen.findByText(/has a new qr code/i);

    const fresh = screen.getByTestId('qr-token').textContent;
    expect(fresh).not.toBe(before);
    const cached = harness.queryClient.getQueryData<EditorFloorPlan>([
      'console',
      'floorPlan',
      BRANCH,
    ]);
    expect(cached!.tables.find((table) => table.label === '2')!.qrToken).toBe(fresh);
  });

  it('opens on a fresh plan, never a cached one whose QR was replaced since', async () => {
    const { gateway } = await seededGateway();
    const harness = createConsoleHarness({ gateway });
    const plan = await gateway.getFloorPlan(BRANCH);
    harness.queryClient.setQueryData(['console', 'floorPlan', BRANCH], plan);
    const two = plan.tables.find((table) => table.label === '2')!;
    const { qrToken } = await gateway.regenerateTableQr({ tableId: two.id });
    const user = userEvent.setup();

    render(harness.wrap(<RoomsEditor branchId={BRANCH} />, '/venue/floorplan'));
    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));

    expect(screen.getByTestId('qr-token').textContent).toBe(qrToken);
  });

  it('locks the editor while a save is in flight, so no edit is lost to it', async () => {
    const { gateway } = await seededGateway();
    const real = gateway.replaceFloorPlan.bind(gateway);
    let release: () => void = () => undefined;
    vi.spyOn(gateway, 'replaceFloorPlan').mockImplementation(async (input) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return real(input);
    });
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));
    await user.type(screen.getByLabelText(/^label$/i), '2');
    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    await screen.findByRole('button', { name: /saving/i });

    // Disabled by the fieldset around the editor, which `.disabled` does not reflect.
    expect(screen.getByLabelText(/^label$/i).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText(/^new room$/i).matches(':disabled')).toBe(true);
    const pin = screen.getByRole('button', { name: /^table 22 · free$/i });
    const left = pin.style.left;
    fireEvent.keyDown(pin, { key: 'ArrowRight' });
    expect(pin.style.left).toBe(left);
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    expect(screen.queryByRole('form', { name: /new table/i })).toBeNull();

    release();
    await screen.findByText(/rooms saved/i);
    expect(screen.getByLabelText(/^new room$/i).matches(':disabled')).toBe(false);
  });

  it('drops the half-made table when another photo is shown or its photo is removed', async () => {
    const { gateway } = await seededGateway();
    picker.next = await upload(gateway, 'second.png');
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    await user.click(screen.getByRole('button', { name: /use the queued photo/i }));
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    expect(screen.getByRole('form', { name: /new table/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /show photo 1/i }));
    expect(screen.queryByRole('form', { name: /new table/i })).toBeNull();

    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    expect(screen.getByRole('form', { name: /new table/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^remove \(1\)$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /remove it/i }),
    );
    expect(screen.queryByRole('form', { name: /new table/i })).toBeNull();
  });

  it("says what the save warned about, in the reader's language where it knows the warning", async () => {
    const { gateway } = await seededGateway();
    const real = gateway.replaceFloorPlan.bind(gateway);
    vi.spyOn(gateway, 'replaceFloorPlan').mockImplementation(async (input) => ({
      ...(await real(input)),
      warnings: [
        'Table(s) 2, 3 were taken off photos this plan removed from every room.',
        'Table(s) 4 were taken off photos this plan moved to another room.',
        'A sentence this client has never seen.',
      ],
      deactivatedTables: ['7'],
    }));
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));

    const saved = (await screen.findByText(/rooms saved/i)).closest('[role="status"]')!;
    expect(saved.textContent).toContain('Taken out of service because they have history: 7.');
    expect(saved.textContent).toContain(
      'Tables 2, 3 were on a photo no room keeps any more, so they are off it now.',
    );
    expect(saved.textContent).toContain(
      'Tables 4 were on a photo that moved to another room, so they are off it now.',
    );
    expect(saved.textContent).toContain('A sentence this client has never seen.');
  });

  it('does not report a table already out of service as taken out by the save', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 1 · free$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete it/i }),
    );
    await screen.findByText(/table 1 has history/i);

    await user.type(screen.getByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));

    const saved = (await screen.findByText(/rooms saved/i)).closest('[role="status"]')!;
    expect(saved.textContent).not.toMatch(/taken out of service/i);
  });

  it('keeps the draft and says so when the newer plan cannot be loaded after a conflict', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await gateway.createFloorArea({ branchId: BRANCH, name: 'Cellar', displayOrder: 7 });
    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    const notice = await screen.findByRole('alert');

    vi.spyOn(gateway, 'getFloorPlan').mockRejectedValue(new NetworkError({ url: '/floor-plan' }));
    await user.click(within(notice).getByRole('button', { name: /reload the rooms/i }));

    await screen.findByText(/the newer rooms could not be loaded/i);
    expect(screen.getByRole('button', { name: /^garden · 0 photos$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^cellar/i })).toBeNull();
  });

  it('moves focus to the table in the unpinned list after Delete takes its pin off', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · free$/i });
    pin.focus();
    await user.keyboard('{Delete}');

    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: /^table 2$/i }));
  });

  it('saves after a table delete in this tab, which moved the plan version', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete it/i }),
    );
    await screen.findByText('Table 2 was removed.');

    await user.type(screen.getByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));

    await screen.findByText(/rooms saved/i);
    expect(screen.queryByText(/someone else changed the rooms/i)).toBeNull();
    expect((await gateway.getFloorPlan(BRANCH)).tables.some((t) => t.label === '2')).toBe(false);
  });

  it('refuses the save of a tab that still shows a table another tab deleted', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    const two = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '2')!;
    await gateway.deleteTable({ branchId: BRANCH, tableId: two.id });

    await user.type(screen.getByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /someone else changed the rooms/i,
    );
    expect((await gateway.getFloorPlan(BRANCH)).tables.some((t) => t.label === '2')).toBe(false);
  });

  it('says before saving that two rooms have the same name', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('heading', { name: room.name });
    const other = (await gateway.getFloorPlan(BRANCH)).areas[1]!;
    const name = screen.getByLabelText(/^room name$/i);
    await user.clear(name);
    await user.type(name, ` ${other.name.toUpperCase()} `);

    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toContain(
      `More than one room is called ${other.name.toUpperCase()}. Give each room its own name.`,
    );
    expect(screen.getByText('Another room already has this name.')).toBeTruthy();
  });
});

describe('the rooms editor, from QA 2026-10-16', () => {
  it('asks before removing a photo with tables on it, naming them, and keeps focus (C-M4)', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    const remove = screen.getByRole('button', { name: /^remove \(1\)$/i });
    await user.click(remove);
    let dialog = screen.getByRole('dialog', { name: /remove photo 1\?/i });
    expect(dialog.textContent).toContain('Tables 1, 2 are pinned on it.');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.getByTestId('room-stage')).toBeTruthy();
    expect(document.activeElement).toBe(remove);

    await user.click(remove);
    dialog = screen.getByRole('dialog', { name: /remove photo 1\?/i });
    await user.click(within(dialog).getByRole('button', { name: /remove it/i }));
    expect(screen.queryByTestId('room-stage')).toBeNull();
    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(within(list).getByRole('button', { name: /^table 1$/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^photos$/i }));
  });

  it('removes a photo with no tables on it straight away, and focuses the photo before it', async () => {
    const { gateway } = await seededGateway();
    picker.next = await upload(gateway, 'second.png');
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    await user.click(screen.getByRole('button', { name: /use the queued photo/i }));
    await user.click(screen.getByRole('button', { name: /^remove \(2\)$/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /^remove \(2\)$/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /show photo 1/i }));
  });

  it('clears "Rooms saved." at the next edit', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.type(await screen.findByLabelText(/^new room$/i), 'Garden');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    await user.click(screen.getByRole('button', { name: /save rooms/i }));
    await screen.findByText(/rooms saved/i);

    await user.type(screen.getByLabelText(/^new room$/i), 'Cellar');
    await user.click(screen.getByRole('button', { name: /add the room/i }));
    expect(screen.queryByText(/rooms saved/i)).toBeNull();
  });

  it('will not save two rooms with one name, and drops a refusal once the plan is edited', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('heading', { name: room.name });
    const other = (await gateway.getFloorPlan(BRANCH)).areas[1]!;
    const name = screen.getByLabelText(/^room name$/i);
    await user.clear(name);
    await user.type(name, other.name);
    const saveButton = screen.getByRole('button', { name: /save rooms/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    await user.type(name, ' room');
    expect(saveButton.disabled).toBe(false);
    vi.spyOn(gateway, 'replaceFloorPlan').mockRejectedValueOnce(
      new ValidationError({
        url: '/floor-plan',
        status: 422,
        problem: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'x',
          code: 'validation-failed',
          traceId: 't',
          context: { fields: [{ field: 'areas[0].photoIds', message: 'x', bound: 'max' }] },
        },
      }),
    );
    await user.click(saveButton);
    await screen.findByText(/has more than 10 photos/i);

    await user.type(name, 's');
    expect(screen.queryByText(/has more than 10 photos/i)).toBeNull();
  });

  it('puts a second table added in the middle beside the first, not on top of it', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · free$/i });
    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByRole('button', { name: /add a table in the middle/i }));
      const form = screen.getByRole('form', { name: /new table/i });
      await user.click(within(form).getByRole('button', { name: /add the table/i }));
    }

    const pins = screen
      .getAllByRole('button', { name: /· not saved yet$/i })
      .map((pin) => `${pin.style.left} ${pin.style.top}`);
    expect(pins).toHaveLength(2);
    expect(new Set(pins).size).toBe(2);
    // Table 2 sits in the middle already: neither new one lands on it.
    expect(pins).not.toContain('50% 50%');
  });

  it('keeps focus on something sensible after each action', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    const form = screen.getByRole('form', { name: /new table/i });
    expect(document.activeElement).toBe(within(form).getByLabelText(/label/i));
    await user.click(within(form).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getByRole('button', { name: /^table 2 · free$/i }));
    await user.click(screen.getByRole('button', { name: /take it off the photo/i }));
    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: /^table 2$/i }));

    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete it/i }),
    );
    await screen.findByText('Table 2 was removed.');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe('stage-title');
  });

  it('runs the delete-room dialog as a modal: focus inside, Escape closes, focus returns', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const opener = await screen.findByRole('button', { name: /delete the room/i });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('counts photos in words when a room is deleted', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /delete the room/i }));
    expect(screen.getByRole('dialog').textContent).toContain('Its photo goes with it.');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getAllByRole('button', { name: /· 0 photos$/i })[0]!);
    await user.click(screen.getByRole('button', { name: /delete the room/i }));
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).toContain('It has no photos.');
    expect(text).not.toMatch(/photo\(s\)/u);
  });

  it('does not call a table diners cannot book "free"', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · free$/i }));
    await user.click(screen.getByRole('checkbox', { name: /diners can book it/i }));

    const pin = screen.getByRole('button', { name: /^table 2 · walk-ins only$/i });
    expect(pin.className).toMatch(/\bis-walk-in\b/u);
    expect(screen.getByRole('list', { name: /pin colours/i }).textContent).toContain(
      'Walk-ins only',
    );
  });

  it('says that putting a table back in service waits for Save', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 1 · free$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete it/i }),
    );
    const out = await screen.findByRole('complementary', { name: /out of service/i });
    await user.click(within(out).getByRole('button', { name: /put it back in service/i }));

    expect(
      screen.getByText('Table 1 goes back into service when you save the rooms.'),
    ).toBeTruthy();
  });
});
