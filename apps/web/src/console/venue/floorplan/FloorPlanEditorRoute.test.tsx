// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { FloorPlanEditorRoute } from './FloorPlanEditorRoute';

/**
 * Two people editing one room.
 *
 * The save is made against the version the editor loaded (K6). When somebody
 * else saved in between, the server refuses and nothing is written; the editor
 * says so and offers the newer plan, rather than overwriting it or failing
 * with a generic "try again" that would overwrite it on the second click.
 *
 * The canvas, the preview and the properties panel are stubbed: they draw with
 * react-native-web and a QR library, and none of them is what this is about.
 */

vi.mock('./EditorCanvas', () => ({ EditorCanvas: () => null }));
vi.mock('./EditorPreview', () => ({ EditorPreview: () => null }));
vi.mock('./PropertiesPanel', () => ({ PropertiesPanel: () => null }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await initConsoleTestI18n();
});

afterEach(cleanup);

const BRANCH = 'b-lumen-cascade';

function renderEditor(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  render(harness.wrap(<FloorPlanEditorRoute branchId={BRANCH} timeZoneId="Asia/Yerevan" />, '/'));
}

/** Somebody else's save of the same room, from another tab. */
async function saveFromAnotherTab(gateway: ConsoleGateway) {
  const plan = await gateway.getFloorPlan(BRANCH);
  await gateway.replaceFloorPlan({
    branchId: BRANCH,
    command: {
      expectedVersion: plan.version,
      floorWidth: plan.floorWidth,
      floorHeight: plan.floorHeight,
      areas: plan.areas,
      tables: plan.tables
        .filter((t) => t.isActive)
        .map((t) => ({
          id: t.id,
          label: t.label,
          seats: t.seats,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height,
          rotationDegrees: t.rotationDegrees,
          shape: t.shape,
          floorAreaName: null,
          isBookable: t.isBookable,
        })),
    },
  });
  return plan.version;
}

describe('saving a floor plan somebody else changed', () => {
  it('refuses with a conflict notice, sends no pins, and reloads the newer plan on request', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const user = userEvent.setup();
    renderEditor(gateway);

    await user.click(await screen.findByRole('button', { name: /add a table/i }));
    expect(screen.getByText(/· unsaved changes$/i)).toBeTruthy();

    const loadedVersion = await saveFromAnotherTab(gateway);
    const replace = vi.spyOn(gateway, 'replaceFloorPlan');

    await user.click(screen.getByRole('button', { name: /save the plan/i }));

    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toMatch(/someone else changed the floor plan/i);
    // The save went against the version this editor loaded, and carried no pins.
    expect(replace).toHaveBeenCalledTimes(1);
    const command = replace.mock.calls[0]![0].command;
    expect(command.expectedVersion).toBe(loadedVersion);
    for (const table of command.tables) expect(table).not.toHaveProperty('photoX');
    // Refused, so the draft is still there to lose — and the notice says it will be.
    expect(screen.getByText(/· unsaved changes$/i)).toBeTruthy();

    await user.click(within(notice).getByRole('button', { name: /reload the plan/i }));

    await waitFor(() =>
      expect(screen.queryByText(/someone else changed the floor plan/i)).toBeNull(),
    );
    await waitFor(() => expect(screen.queryByText(/· unsaved changes$/i)).toBeNull());

    // And the next save is made against the newer version, and goes through.
    const current = await gateway.getFloorPlan(BRANCH);
    await user.click(screen.getByRole('button', { name: /add a table/i }));
    await user.click(screen.getByRole('button', { name: /save the plan/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace.mock.calls[1]![0].command.expectedVersion).toBe(current.version);
    await screen.findByText(/plan saved/i);
  });
});
