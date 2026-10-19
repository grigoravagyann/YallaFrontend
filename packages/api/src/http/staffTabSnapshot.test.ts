import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { fakeBackend } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * The tab as staff read it, from one snapshot (FT3 review S4).
 *
 * `GET /api/tabs/{id}/participants` answers `TabStaffView` with the lines, the
 * adjustments and the branch's service percentage. The tablet used to throw
 * the first two away and assemble lines from three branch-wide order reads,
 * which refresh on their own: a total and the lines it is made of then came
 * from two different moments.
 */

type StaffView = components['schemas']['Yalla.Application.Tabs.TabStaffView'];

const TAB = '7d0c0000-0000-4000-8000-000000000001';
const ANI = '5a1e0000-0000-4000-8000-0000000000a1';
const GOR = '5a1e0000-0000-4000-8000-0000000000a2';

const VIEW: StaffView = {
  tabId: TAB,
  branchId: 'b-1',
  diningTableId: 't-4',
  tableLabel: '4',
  timeZoneId: 'Asia/Yerevan',
  status: 1,
  settlementMode: 1,
  settlementModeLocked: false,
  hostParticipantId: GOR,
  serviceChargePercent: 15,
  openedAtUtc: '2026-10-19T12:28:00Z',
  closedAtUtc: null,
  maxSequence: 9,
  participants: [],
  lines: [
    {
      lineId: 'l-steak',
      orderId: 'o-1',
      menuItemId: 'steak',
      name: 'Steak',
      quantity: 1,
      unitPriceAmd: 9_800,
      lineTotalAmd: 9_800,
      isShared: false,
      isTableAttributed: false,
      isVoided: false,
      onBehalfOfParticipantId: GOR,
      orderStatus: 4,
      sharedWithCount: 0,
      note: 'Medium',
    },
    {
      lineId: 'l-latte',
      orderId: 'o-2',
      menuItemId: 'latte',
      name: 'Latte',
      quantity: 2,
      unitPriceAmd: 1_400,
      lineTotalAmd: 2_800,
      isShared: false,
      isTableAttributed: false,
      isVoided: false,
      placedByParticipantId: ANI,
      placedByDisplayName: 'Ani',
      orderStatus: 2,
      sharedWithCount: 0,
    },
    {
      lineId: 'l-negroni',
      orderId: 'o-1',
      menuItemId: 'negroni',
      name: 'Negroni',
      quantity: 1,
      unitPriceAmd: 3_400,
      lineTotalAmd: 0,
      isShared: false,
      isTableAttributed: true,
      isVoided: true,
      voidReason: 'Wrong item',
      voidedAtUtc: '2026-10-19T13:00:00Z',
      orderStatus: 4,
      sharedWithCount: 2,
    },
  ],
  adjustments: [
    {
      adjustmentId: 'a-1',
      kind: 2,
      lineId: 'l-steak',
      percent: 100,
      reason: 'Birthday',
      reductionAmd: 9_800,
      isVoided: false,
      appliedAtUtc: '2026-10-19T13:10:00Z',
    },
  ],
  totals: {
    subtotalAmd: 2_800,
    serviceChargeAmd: 336,
    totalAmd: 3_136,
    paidAmd: 0,
    remainingAmd: 3_136,
  },
  tipsAmd: 0,
} as unknown as StaffView;

async function read() {
  const backend = fakeBackend({ [`GET /api/tabs/${TAB}/participants`]: { body: VIEW } });
  return (await createStaffHttpGateway(backend.client()).getStaffTab(TAB))!;
}

describe('the tab staff read', () => {
  it('keeps the lines, with who they are for, who ordered from a phone, and why one was voided', async () => {
    const tab = await read();
    expect(tab.linesKnown).toBe(true);
    expect(tab.lines.map((line) => line.id)).toEqual(['l-steak', 'l-latte', 'l-negroni']);
    expect(tab.lines[0]).toMatchObject({
      onBehalfOfParticipantId: GOR,
      orderStatus: 'served',
      status: 'active',
      note: 'Medium',
    });
    expect(tab.lines[1]).toMatchObject({ participantId: ANI, orderedByName: 'Ani' });
    expect(tab.lines[2]).toMatchObject({
      status: 'voided',
      voidReason: 'Wrong item',
      lineTotalDram: 0,
    });
  });

  it('keeps every adjustment on the tab, from any device', async () => {
    const tab = await read();
    expect(tab.adjustmentsKnown).toBe(true);
    expect(tab.adjustments).toEqual([
      expect.objectContaining({
        id: 'a-1',
        kind: 'comp',
        lineId: 'l-steak',
        reason: 'Birthday',
        reductionDram: 9_800,
        isVoided: false,
      }),
    ]);
  });

  it('takes the service percentage the tab carries, not one worked out from its totals', async () => {
    expect((await read()).serviceChargePercent).toBe(15);
  });
});
