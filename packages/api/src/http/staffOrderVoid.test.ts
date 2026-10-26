import { describe, expect, it } from 'vitest';
import { LineAlreadyPaidError, OrderNotVoidableError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import { fakeBackend, problemReply } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * `POST /api/orders/{id}/status` with `Voided` (2026-10-25): the server voids
 * the order's lines with it, and refuses with `line-already-paid` once the tab
 * has been paid against. That 409 is the bill, not a race, so the gateway
 * names it — the same error one line's void throws — while the rail's own 409
 * (`conflicting-state`) stays what it always was.
 */

const ROUTE = 'POST /api/orders/o-1/status';

function gatewayOver(routes: Parameters<typeof fakeBackend>[0]) {
  return createStaffHttpGateway(fakeBackend(routes).client());
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a refusal.');
}

describe('voiding a whole order on a paid tab', () => {
  it('is a LineAlreadyPaidError naming the first line still on the bill', async () => {
    const gateway = gatewayOver({
      [ROUTE]: problemReply(409, 'line-already-paid', { tabId: 'tab-1', lineId: 'l-1' }),
    });

    const error = await caught(
      gateway.setOrderStatus({ orderId: 'o-1', status: 'voided', clientCommandId: 'c-1' }),
    );

    expect(error).toBeInstanceOf(LineAlreadyPaidError);
    expect((error as LineAlreadyPaidError).lineId).toBe('l-1');
    expect((error as LineAlreadyPaidError).status).toBe(409);
  });

  it('leaves the rail refusing a move as a conflict, as before', async () => {
    const gateway = gatewayOver({
      [ROUTE]: problemReply(409, 'conflicting-state', { orderId: 'o-1' }),
    });

    const error = await caught(
      gateway.setOrderStatus({ orderId: 'o-1', status: 'ready', clientCommandId: 'c-2' }),
    );

    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect(error).not.toBeInstanceOf(LineAlreadyPaidError);
  });

  it('sends only the status: the server stamps its own reason on the lines', async () => {
    const backend = fakeBackend({
      [ROUTE]: problemReply(409, 'line-already-paid', { tabId: 'tab-1', lineId: 'l-1' }),
    });
    const gateway = createStaffHttpGateway(backend.client());

    await caught(
      gateway.setOrderStatus({ orderId: 'o-1', status: 'voided', clientCommandId: 'c-0' }),
    );

    expect(backend.requests[0]?.body).toEqual({ status: 5 });
  });
});

describe('voiding an order the rail no longer lets go', () => {
  it('is an OrderNotVoidableError, not a table race: voided already, ready or served', async () => {
    const gateway = gatewayOver({
      [ROUTE]: problemReply(409, 'conflicting-state', { orderId: 'o-1' }),
    });

    const error = await caught(
      gateway.setOrderStatus({ orderId: 'o-1', status: 'voided', clientCommandId: 'c-3' }),
    );

    expect(error).toBeInstanceOf(OrderNotVoidableError);
    expect(error).not.toBeInstanceOf(ConcurrencyConflictError);
    expect((error as OrderNotVoidableError).orderId).toBe('o-1');
    expect((error as OrderNotVoidableError).status).toBe(409);
  });
});
