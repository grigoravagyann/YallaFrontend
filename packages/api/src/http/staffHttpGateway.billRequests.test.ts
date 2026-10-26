import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { fakeBackend, offSchema, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import { serviceRequest } from './staffMapping';

/**
 * Who asked for the bill, at the counter.
 *
 * A "my share" request is one person's money: the tablet has to know whose,
 * both to put a name on it and to credit exactly that person when the cash is
 * handed over.
 */

type RequestWire = components['schemas']['Yalla.Application.Ordering.ServiceRequestView'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const TAB = '7d0c0000-0000-4000-8000-000000000001';
const KAREN = '5a1e0000-0000-4000-8000-0000000000b2';

const REQUEST: RequestWire = {
  serviceRequestId: 'sr-1',
  tabId: TAB,
  tableLabel: '7',
  preset: 3,
  createdAtUtc: '2026-09-20T17:00:00Z',
  waitingMinutes: 2,
  tabEventSequence: 4,
  requestedByParticipantId: KAREN,
  billScope: 2,
  billAmountAmd: 1430,
  tipPercent: 10,
  tipAmd: 130,
};

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { gateway: createStaffHttpGateway(backend.client()), backend };
}

describe('the person behind a service request', () => {
  it('keeps who asked from the wire', () => {
    expect(serviceRequest(REQUEST).requestedByParticipantId).toBe(KAREN);
  });

  it('says nobody when the server named nobody', () => {
    const { requestedByParticipantId: _omitted, ...anonymous } = REQUEST;
    expect(serviceRequest(anonymous).requestedByParticipantId).toBeNull();
    expect(
      serviceRequest({ ...REQUEST, requestedByParticipantId: null }).requestedByParticipantId,
    ).toBeNull();
  });

  it('carries it on the branch list and on the acknowledgement', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/branches/${BRANCH}/service-requests`]: { body: [REQUEST] },
      'POST /api/service-requests/sr-1/acknowledge': offSchema(
        { body: { ...REQUEST, acknowledgedAtUtc: '2026-09-20T17:03:00Z' } },
        'the gateway still sends clientCommandId, which this route takes no body for; reported, not changed (no behaviour change)',
      ),
    });

    const [listed] = await gateway.listServiceRequests(BRANCH);
    expect(listed).toMatchObject({
      id: 'sr-1',
      requestedByParticipantId: KAREN,
      bill: { scope: 'mine', amountDram: 1430, tipPercent: 10, tipDram: 130 },
    });

    const acknowledged = await gateway.acknowledgeServiceRequest({
      requestId: 'sr-1',
      clientCommandId: 'c-ack',
    });
    expect(backend.requests[1]?.body).toEqual({ clientCommandId: 'c-ack' });
    expect(acknowledged.requestedByParticipantId).toBe(KAREN);
    expect(acknowledged.acknowledgedAtUtc).toBe('2026-09-20T17:03:00Z');
  });
});

describe('cash handed over by one person', () => {
  const cashReply = {
    status: 201,
    body: {
      paymentId: 'pay-1',
      tabId: TAB,
      amountAmd: 1430,
      tipAmd: 130,
      status: 2,
      tabClosed: false,
      tableSessionClosed: false,
      tabEventSequence: 5,
      tabParticipantId: KAREN,
      totals: {
        subtotalAmd: 4550,
        serviceChargeAmd: 455,
        totalAmd: 5005,
        paidAmd: 1430,
        remainingAmd: 3575,
      },
      wasReplay: false,
    },
  };

  it('names the payer when the waiter knows who it is', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/tabs/${TAB}/payments/cash`]: cashReply,
    });

    const result = await gateway.recordCashPayment({
      tabId: TAB,
      amountDram: 1430,
      tipDram: 130,
      clientCommandId: 'c-cash',
      participantId: KAREN,
    });

    expect(backend.requests[0]?.body).toEqual({
      amountAmd: 1430,
      tipAmd: 130,
      clientCommandId: 'c-cash',
      tabParticipantId: KAREN,
    });
    expect(result.totals?.remainingDram).toBe(3575);
  });

  it('sends no payer at all when nobody was named', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/tabs/${TAB}/payments/cash`]: cashReply,
    });

    await gateway.recordCashPayment({
      tabId: TAB,
      amountDram: 1430,
      tipDram: 0,
      clientCommandId: 'c-cash-2',
    });

    expect(backend.requests[0]?.body).not.toHaveProperty('tabParticipantId');
  });
});
