// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  NetworkError,
  ValidationError,
  createConsoleMockGateway,
  type ConsoleGateway,
  type EditorFloorPlan,
  type Photo,
} from '@yalla/api';
import { queryKeys, useEditorFloorPlan } from '@yalla/api/react';
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
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

/** One action, waiting for the next commit that re-reads the plan. */
class NextCommit {
  private action: (() => void) | null = null;

  arm(action: () => void) {
    this.action = action;
  }

  /** The armed action, handed over once. */
  take(): (() => void) | null {
    const action = this.action;
    this.action = null;
    return action;
  }

  get armed(): boolean {
    return this.action !== null;
  }
}

/**
 * Runs the armed action in the layout phase of the next commit that re-reads
 * the plan: after that commit is on screen, before its effects have run.
 */
function BetweenCommitAndEffects({ next }: { next: NextCommit }) {
  useEditorFloorPlan(BRANCH);
  useLayoutEffect(() => {
    next.take()?.();
  });
  return null;
}

function renderEditor(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <ToastProvider>
        <RoomsEditor branchId={BRANCH} branchName="Cascade" />
      </ToastProvider>,
      '/venue/floorplan',
    ),
  );
  return harness;
}

async function stage() {
  const element = await screen.findByTestId('room-stage');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
  return element;
}

const saveButton = () => screen.getByRole('button', { name: /^save rooms$/i });
const saveBar = () => screen.getByRole('region', { name: /^saving$/i });

async function addRoom(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText(/^new room$/i), name);
  await user.click(screen.getByRole('button', { name: /add the room/i }));
}

/** A menu item of the ⋮ menu named `menu`. */
async function fromMenu(user: ReturnType<typeof userEvent.setup>, menu: RegExp, item: RegExp) {
  await user.click(screen.getByRole('button', { name: menu }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

describe('the rooms editor', () => {
  it('adds a room and a photo, adds a table where the photo is clicked, and saves them together', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    picker.next = await upload(gateway, 'vip.png');
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    await addRoom(user, 'VIP');
    expect(screen.getByRole('heading', { name: 'VIP' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^photo$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /use the queued photo/i }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.pointerDown(await stage(), { clientX: 50, clientY: 25, pointerId: 1 });

    // Added at once: the next number, four seats, and the focus on its number.
    const label = screen.getByLabelText(/^number/i) as HTMLInputElement;
    expect(label.value).toBe('13');
    expect(document.activeElement).toBe(label);
    fireEvent.change(screen.getByLabelText(/^seats$/i), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: /^table 13 · not saved yet$/i })).toBeTruthy();

    await user.click(saveButton());
    await screen.findByText('Rooms saved');

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
    const saved = await gateway.getFloorPlan(BRANCH);
    expect(saved.tables.find((table) => table.label === '13')?.pin).toEqual({
      photoId: picker.next!.photoId,
      x: 0.25,
      y: 0.25,
    });
  });

  it('warns about bookable tables on no photo, and offers to place the first', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const warning = await screen.findByTestId('unpinned-warning');
    expect(warning.textContent).toMatch(
      /Tables 3, 4, .*, 12 can be booked but are on no photo, so guests can neither see nor book them\./u,
    );
    expect(warning.textContent).not.toMatch(/\b1, 2\b/u);

    await user.click(within(warning).getByRole('button', { name: /place table 3/i }));
    expect(screen.getByText(/click where table 3 stands to place it/i)).toBeTruthy();
  });

  it('draws a bookable pin in the brand, and a new table dashed', async () => {
    const { gateway } = await seededGateway();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    expect(pin.className).not.toMatch(/\bis-(walk|new)\b/u);
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    const added = screen.getByRole('button', { name: /· not saved yet$/i });
    expect(added.className).toMatch(/\bis-new\b/u);
  });

  it('moves a selected pin with the arrow keys and takes it off the photo with Delete', async () => {
    const { gateway, photo } = await seededGateway();
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    pin.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}');
    await user.click(saveButton());
    await screen.findByText('Rooms saved');
    expect(replace.mock.calls[0]![0].command.tables.find((t) => t.label === '2')?.pin).toEqual({
      photoId: photo.photoId,
      x: 0.51,
      y: 0.55,
    });

    const moved = await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    moved.focus();
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('button', { name: /^table 2 · bookable$/i })).toBeNull();
    expect(screen.getByTestId('unpinned-warning').textContent).toMatch(/\b2, 3\b/u);
  });

  it('drags a pin to where the pointer lets go', async () => {
    const { gateway, photo } = await seededGateway();
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    await stage();
    const pin = await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    fireEvent.pointerDown(pin, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(pin, { clientX: 150, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(pin, { pointerId: 1 });

    await user.click(saveButton());
    await screen.findByText('Rooms saved');
    expect(replace.mock.calls[0]![0].command.tables.find((t) => t.label === '2')?.pin).toEqual({
      photoId: photo.photoId,
      x: 0.75,
      y: 0.2,
    });
  });

  it('places a table from "Not on a photo" where the photo is clicked, and Escape stops it', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const list = await screen.findByRole('region', { name: /not on a photo/i });
    await user.click(within(list).getByRole('button', { name: /^place table 4$/i }));
    expect(screen.getByText(/click where table 4 stands/i)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/click where table 4 stands/i)).toBeNull();

    await user.click(within(list).getByRole('button', { name: /^place table 3$/i }));
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    expect(screen.getByRole('button', { name: /^table 3 · bookable$/i })).toBeTruthy();
    // Placed, not a new table added beside it.
    expect(screen.queryByRole('button', { name: /· not saved yet$/i })).toBeNull();
  });

  it('takes the pins off a removed photo, and a deleted room leaves its tables in no room', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    await fromMenu(user, /actions for photo 1/i, /remove the photo/i);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /remove it/i }),
    );
    expect(screen.queryByTestId('room-stage')).toBeNull();
    expect(screen.getByTestId('unpinned-warning').textContent).toMatch(/Tables 1, 2, 3/u);

    await fromMenu(user, new RegExp(`actions for ${room.name}`, 'iu'), /delete the room/i);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/its 4 tables stay, with no room and no pin/i);
    await user.click(within(dialog).getByRole('button', { name: /delete it/i }));

    expect(screen.queryByRole('button', { name: new RegExp(`^${room.name}`, 'u') })).toBeNull();
    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(within(list).getAllByText('No room')).toHaveLength(4);
  });

  it('deletes a never-used table, and takes one with history out of service, saying which', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    let dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/never been used, so it is removed for good/i);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await screen.findByText('Table 2 was removed');
    expect(screen.queryByRole('button', { name: /^table 2 · bookable$/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^table 1 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/kept for the records and taken out of service/i);
    await user.click(within(dialog).getByRole('button', { name: /take out of service/i }));
    await screen.findByText('Table 1 has history, so it was taken out of service');

    const out = screen.getByRole('region', { name: /out of service/i });
    expect(within(out).getByText('1')).toBeTruthy();
    // Done on the server already: nothing is waiting to be saved.
    expect(saveBar().textContent).toMatch(/everything is saved/i);
    const plan = await gateway.getFloorPlan(BRANCH);
    expect(plan.tables.find((t) => t.label === '1')?.isActive).toBe(false);
    expect(plan.tables.some((t) => t.label === '2')).toBe(false);

    await user.click(within(out).getByRole('button', { name: /put table 1 back in service/i }));
    expect(saveBar().textContent).toMatch(/unsaved changes/i);
    expect(screen.getByText('Table 1 goes back into service when you save the rooms')).toBeTruthy();
  });

  it("undoes a table's delete by putting it back, waiting for Save", async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');
    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(await screen.findByText('Table 2 comes back when you save the rooms')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^table 2 · not saved yet$/i })).toBeTruthy();
    expect(saveBar().textContent).toMatch(/unsaved changes/i);
  });

  it('refuses a save somebody else got in before, and reloads the newer plan on request', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await addRoom(user, 'Garden');
    // Another tab adds a room: the room routes move the version too.
    await gateway.createFloorArea({ branchId: BRANCH, name: 'Cellar', displayOrder: 7 });

    await user.click(saveButton());
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toMatch(/someone else changed the rooms/i);

    await user.click(within(notice).getByRole('button', { name: /load the newer version/i }));
    await waitFor(() => expect(screen.queryByText(/someone else changed the rooms/i)).toBeNull());
    expect(screen.getByRole('button', { name: /^cellar(?!:)/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^garden(?!:)/i })).toBeNull();
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

    await addRoom(user, 'Garden');
    await user.click(saveButton());

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

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    const before = screen.getByTestId('qr-token').textContent;
    await user.click(screen.getByRole('button', { name: /regenerate the qr/i }));
    const dialog = screen.getByRole('alertdialog');
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

  it('will not regenerate until the number is typed', async () => {
    const { gateway } = await seededGateway();
    const regen = vi.spyOn(gateway, 'regenerateTableQr');
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /regenerate the qr/i }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /regenerate it/i }));
    expect(regen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(dialog).getByLabelText(/type 2 to confirm/i));
  });

  it('opens on a fresh plan, never a cached one whose QR was replaced since', async () => {
    const { gateway } = await seededGateway();
    const harness = createConsoleHarness({ gateway });
    const plan = await gateway.getFloorPlan(BRANCH);
    harness.queryClient.setQueryData(['console', 'floorPlan', BRANCH], plan);
    const two = plan.tables.find((table) => table.label === '2')!;
    const { qrToken } = await gateway.regenerateTableQr({ tableId: two.id });
    const user = userEvent.setup();

    render(
      harness.wrap(
        <ToastProvider>
          <RoomsEditor branchId={BRANCH} />
        </ToastProvider>,
        '/venue/floorplan',
      ),
    );
    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));

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

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.type(screen.getByLabelText(/^number/i), '2');
    await user.click(saveButton());
    await screen.findByRole('button', { name: /saving/i });

    // Disabled by the fieldset around the editor, which `.disabled` does not reflect.
    expect(screen.getByLabelText(/^number/i).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText(/^new room$/i).matches(':disabled')).toBe(true);
    const pin = screen.getByRole('button', { name: /^table 22 · bookable$/i });
    const left = pin.style.left;
    fireEvent.keyDown(pin, { key: 'ArrowRight' });
    expect(pin.style.left).toBe(left);
    fireEvent.pointerDown(await stage(), { clientX: 20, clientY: 80, pointerId: 1 });
    expect(screen.queryByRole('button', { name: /· not saved yet$/i })).toBeNull();

    release();
    await screen.findByText('Rooms saved');
    expect(screen.getByLabelText(/^new room$/i).matches(':disabled')).toBe(false);
  });

  it("says what the save warned about, in the reader's language, until the next edit", async () => {
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

    await addRoom(user, 'Garden');
    await user.click(saveButton());

    const saved = await screen.findByTestId('save-result');
    expect(saved.textContent).toContain('Taken out of service because they have history: 7.');
    expect(saved.textContent).toContain(
      'Tables 2, 3 were on a photo no room keeps any more, so they are off it now.',
    );
    expect(saved.textContent).toContain(
      'Tables 4 were on a photo that moved to another room, so they are off it now.',
    );
    expect(saved.textContent).toContain('A sentence this client has never seen.');

    await addRoom(user, 'Cellar');
    expect(screen.queryByTestId('save-result')).toBeNull();
  });

  it('does not report a table already out of service as taken out by the save', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 1 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /take out of service/i,
      }),
    );
    await screen.findByText(/table 1 has history/i);

    await addRoom(user, 'Garden');
    await user.click(saveButton());
    await screen.findByText('Rooms saved');
    expect(screen.queryByTestId('save-result')).toBeNull();
  });

  it('keeps the draft and says so when the newer plan cannot be loaded after a conflict', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await addRoom(user, 'Garden');
    await gateway.createFloorArea({ branchId: BRANCH, name: 'Cellar', displayOrder: 7 });
    await user.click(saveButton());
    const notice = await screen.findByRole('alert');

    vi.spyOn(gateway, 'getFloorPlan').mockRejectedValue(new NetworkError({ url: '/floor-plan' }));
    await user.click(within(notice).getByRole('button', { name: /load the newer version/i }));

    await screen.findByText(/the newer version could not be loaded/i);
    expect(screen.getByRole('button', { name: /^garden(?!:)/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^cellar(?!:)/i })).toBeNull();
  });

  it('moves focus to the table in "Not on a photo" after Delete takes its pin off', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    const pin = await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    pin.focus();
    await user.keyboard('{Delete}');

    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(document.activeElement).toBe(
      within(list).getByRole('button', { name: /^place table 2$/i }),
    );
  });

  it('saves after a table delete in this tab, which moved the plan version', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');

    await addRoom(user, 'Garden');
    await user.click(saveButton());

    await screen.findByText('Rooms saved');
    expect(screen.queryByText(/someone else changed the rooms/i)).toBeNull();
    expect((await gateway.getFloorPlan(BRANCH)).tables.some((t) => t.label === '2')).toBe(false);
  });

  it('takes the version the delete answers with, without reading the plan again', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    const read = vi
      .spyOn(gateway, 'getFloorPlan')
      .mockRejectedValue(new NetworkError({ url: '/floor-plan' }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');
    read.mockRestore();

    await addRoom(user, 'Garden');
    await user.click(saveButton());
    await screen.findByText('Rooms saved');
  });

  it('shows the server sentence when a delete is refused for a reason it names', async () => {
    const { gateway } = await seededGateway();
    vi.spyOn(gateway, 'deleteTable').mockRejectedValue(
      new ConcurrencyConflictError({
        url: '/tables/x',
        problem: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Table 2 has upcoming bookings ABC123, XYZ789. Cancel or move them first.',
          code: 'table-has-upcoming-bookings',
          traceId: 't',
        },
      }),
    );
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Table 2 has upcoming bookings ABC123, XYZ789. Cancel or move them first.',
    );
  });

  it('shows the server sentence when a save is refused for a table with upcoming bookings', async () => {
    const { gateway } = await seededGateway();
    const sentence = 'Table 2 has upcoming bookings ABC123. Cancel or move them first.';
    vi.spyOn(gateway, 'replaceFloorPlan').mockRejectedValue(
      new ConcurrencyConflictError({
        url: '/floor-plan',
        problem: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: sentence,
          code: 'table-has-upcoming-bookings',
          traceId: 't',
        },
      }),
    );
    const user = userEvent.setup();
    renderEditor(gateway);

    await addRoom(user, 'Garden');
    await user.click(saveButton());

    expect((await screen.findByRole('alert')).textContent).toBe(sentence);
  });

  it('refuses the save of a tab that still shows a table another tab deleted', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    const two = (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '2')!;
    await gateway.deleteTable({ branchId: BRANCH, tableId: two.id });

    await addRoom(user, 'Garden');
    await user.click(saveButton());

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /someone else changed the rooms/i,
    );
    expect((await gateway.getFloorPlan(BRANCH)).tables.some((t) => t.label === '2')).toBe(false);
  });

  it("will not give a room another room's name, nor add one twice", async () => {
    const { gateway, room } = await seededGateway();
    const rename = vi.spyOn(gateway, 'replaceFloorPlan');
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    const other = (await gateway.getFloorPlan(BRANCH)).areas[1]!;
    await fromMenu(user, new RegExp(`actions for ${room.name}`, 'iu'), /^rename$/i);
    const dialog = screen.getByRole('dialog', { name: /rename/i });
    const field = within(dialog).getByLabelText(/^room name$/i);
    await user.clear(field);
    await user.type(field, ` ${other.name.toUpperCase()} `);
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(within(dialog).getByText('Another room already has this name.')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await addRoom(user, other.name.toLowerCase());
    expect(await screen.findByText('A room with that name exists already')).toBeTruthy();
    expect(saveBar().textContent).toMatch(/everything is saved/i);
    expect(rename).not.toHaveBeenCalled();
  });
});

describe('the rooms editor, from QA 2026-10-16', () => {
  it('asks before removing a photo with tables on it, naming them, and keeps focus (C-M4)', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    const kebab = screen.getByRole('button', { name: /actions for photo 1/i });
    await fromMenu(user, /actions for photo 1/i, /remove the photo/i);
    let dialog = screen.getByRole('alertdialog', { name: /remove photo 1\?/i });
    expect(dialog.textContent).toContain('Tables 1, 2 are pinned on it.');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.getByTestId('room-stage')).toBeTruthy();
    expect(document.activeElement).toBe(kebab);

    await fromMenu(user, /actions for photo 1/i, /remove the photo/i);
    dialog = screen.getByRole('alertdialog', { name: /remove photo 1\?/i });
    await user.click(within(dialog).getByRole('button', { name: /remove it/i }));
    expect(screen.queryByTestId('room-stage')).toBeNull();
    const list = screen.getByRole('region', { name: /not on a photo/i });
    expect(within(list).getByRole('button', { name: /^place table 1$/i })).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('stage-title')),
    );
  });

  it('removes a photo with no tables on it straight away, and focuses the photo before it', async () => {
    const { gateway } = await seededGateway();
    picker.next = await upload(gateway, 'second.png');
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    await user.click(screen.getByRole('button', { name: /^photo$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /use the queued photo/i }),
    );
    expect(screen.getByRole('button', { name: /show photo 2/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await fromMenu(user, /actions for photo 2/i, /remove the photo/i);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /show photo 2/i })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /show photo 1/i })),
    );
  });

  it('drops a refused save once the plan is edited', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

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
    await addRoom(user, 'Garden');
    await user.click(saveButton());
    await screen.findByText(/has more than 10 photos/i);

    await addRoom(user, 'Cellar');
    expect(screen.queryByText(/has more than 10 photos/i)).toBeNull();
  });

  it('focuses a new table’s number when the click lands before the last render’s effects ran', async () => {
    // A click handled between a commit and that commit's effects — what a
    // busy machine does, made certain: a background read re-renders the
    // editor, and the click arrives while that render's effects still wait.
    const { gateway } = await seededGateway();
    const harness = createConsoleHarness({ gateway });
    const clickBetween = new NextCommit();
    render(
      harness.wrap(
        <ToastProvider>
          <RoomsEditor branchId={BRANCH} branchName="Cascade" />
          <BetweenCommitAndEffects next={clickBetween} />
        </ToastProvider>,
        '/venue/floorplan',
      ),
    );
    const picture = await stage();

    clickBetween.arm(() =>
      picture.dispatchEvent(
        createEvent.pointerDown(picture, { clientX: 20, clientY: 80, pointerId: 1 }),
      ),
    );
    const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      void harness.queryClient.invalidateQueries({ queryKey: queryKeys.editorFloorPlan(BRANCH) });
      // The new table's panel comes up, and its number takes the focus.
      await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^number/i)));
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    }
    expect(clickBetween.armed).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText(/^number/i));
  });

  it('puts a second table added in the middle beside the first, not on top of it', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByRole('button', { name: /add a table in the middle/i }));
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
    expect(document.activeElement).toBe(screen.getByLabelText(/^number/i));

    await user.click(screen.getByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /take it off the photo/i }));
    const list = screen.getByRole('region', { name: /not on a photo/i });
    const place = within(list).getByRole('button', { name: /^place table 2$/i });
    expect(document.activeElement).toBe(place);
    expect(await screen.findByText('Table 2 is off the photo')).toBeTruthy();

    await user.click(place);
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe('stage-title');
  });

  it('runs the delete-room dialog as a modal: focus inside, Escape closes, focus returns', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    const kebab = screen.getByRole('button', {
      name: new RegExp(`actions for ${room.name}`, 'iu'),
    });
    await fromMenu(user, new RegExp(`actions for ${room.name}`, 'iu'), /delete the room/i);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(kebab);
  });

  it('counts photos in words when a room is deleted', async () => {
    const { gateway, room } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    await fromMenu(user, new RegExp(`actions for ${room.name}`, 'iu'), /delete the room/i);
    expect(screen.getByRole('alertdialog').textContent).toContain('Its photo goes with it.');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /cancel/i }),
    );

    const other = (await gateway.getFloorPlan(BRANCH)).areas[1]!;
    await fromMenu(user, new RegExp(`actions for ${other.name}`, 'iu'), /delete the room/i);
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toContain('It has no photos.');
    expect(text).not.toMatch(/photo\(s\)/u);
  });

  it('draws a table guests cannot book as walk-ins only', async () => {
    const { gateway } = await seededGateway();
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('checkbox', { name: /guests can book it/i }));

    const pin = screen.getByRole('button', { name: /^table 2 · walk-ins only$/i });
    expect(pin.className).toMatch(/\bis-walk\b/u);
    expect(screen.getByRole('list', { name: /pin colours/i }).textContent).toContain(
      'Walk-ins only',
    );
  });
});

describe('room photos in the 4:3 frame (VC3 wire §3)', () => {
  it('draws a photo of another shape whole, with its pins on the photo and not the frame', async () => {
    const { gateway } = await seededGateway();
    const wide = await upload(gateway, 'wide.png');
    picker.next = { ...wide, width: 1600, height: 900 };
    const user = userEvent.setup();
    renderEditor(gateway);

    await screen.findByRole('button', { name: /^table 2 · bookable$/i });
    await user.click(screen.getByRole('button', { name: /^photo$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /use the queued photo/i }),
    );

    // 16:9 in 4:3: the full width, three quarters of the height, letterboxed.
    const picture = await stage();
    expect(picture.style.width).toBe('100%');
    expect(picture.style.height).toBe('75%');

    // A click on the bar beside it adds nothing; one on the photo adds a table there.
    fireEvent.pointerDown(picture.parentElement!, { clientX: 5, clientY: 5, pointerId: 1 });
    expect(screen.queryByRole('button', { name: /· not saved yet$/i })).toBeNull();
    fireEvent.pointerDown(picture, { clientX: 100, clientY: 50, pointerId: 1 });
    const pin = screen.getByRole('button', { name: /· not saved yet$/i });
    expect([pin.style.left, pin.style.top]).toEqual(['50%', '50%']);
  });
});

describe("a table delete's undo, review round 2", () => {
  it('does not claim to put the table back once the editor is gone', async () => {
    const { gateway } = await seededGateway();
    const harness = createConsoleHarness({ gateway });
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>
            Leave the rooms
          </button>
          {shown ? <RoomsEditor branchId={BRANCH} /> : null}
        </>
      );
    }
    render(
      harness.wrap(
        <ToastProvider>
          <Host />
        </ToastProvider>,
        '/venue/floorplan',
      ),
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');
    await user.click(screen.getByRole('button', { name: 'Leave the rooms' }));
    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(
      await screen.findByText(
        'Table 2 can no longer be put back from here. Add it again on the Rooms page.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Table 2 comes back when you save the rooms')).toBeNull();
  });

  it('does not put the table back into a save already on its way', async () => {
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

    await user.click(await screen.findByRole('button', { name: /^table 2 · bookable$/i }));
    await user.click(screen.getByRole('button', { name: /delete the table/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
    );
    await screen.findByText('Table 2 was removed');
    await addRoom(user, 'Garden');
    await user.click(saveButton());
    await screen.findByRole('button', { name: /saving/i });
    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(
      await screen.findByText(
        'Table 2 can no longer be put back from here. Add it again on the Rooms page.',
      ),
    ).toBeTruthy();
    release();
    await screen.findByText('Rooms saved');
    expect(screen.queryByRole('button', { name: /^table 2 · not saved yet$/i })).toBeNull();
  });
});
