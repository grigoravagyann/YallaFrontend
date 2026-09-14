import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { newCommandId } from '../ids';
import { createMockGateway } from './mockGateway';
import { mockTableCode } from './tableCodes';

/**
 * A `clientCommandId` the server cannot bind, refused by the mock as the server
 * refuses it.
 *
 * The request types declare the field a `Guid`: `cmd-1` is a 400
 * `invalid-request` before any rule runs, and the empty GUID is the same 400
 * from `ClientCommandIdFilter`. The HTTP client maps that 400 to a
 * `ValidationError`. A mock that accepted any string let callers and tests pass
 * ids the backend would never take.
 */

const NOT_BINDABLE = ['cmd-1', '', '00000000-0000-0000-0000-000000000000', 'not-a-guid-at-all'];

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function expectInvalidRequest(error: unknown): void {
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as ValidationError).status).toBe(400);
  expect((error as ValidationError).problem?.code).toBe('invalid-request');
}

function gateway() {
  return createMockGateway({ latencyMs: 0, simulateJoiners: false });
}

describe('a clientCommandId that is not a GUID', () => {
  it.each(NOT_BINDABLE)('%j is refused by the table scan', async (commandId) => {
    expectInvalidRequest(
      await refusal(
        gateway().scanTableCode({ tableCode: mockTableCode('b-lumen-north-t4'), commandId }),
      ),
    );
  });

  it('is refused on a booking before any booking rule', async () => {
    expectInvalidRequest(
      await refusal(
        gateway().createBooking({
          commandId: 'cmd-1',
          branchId: 'b-unknown',
          tableId: 't-unknown',
          slotUtc: '2030-01-01T18:00:00.000Z',
          timeZoneId: 'Asia/Yerevan',
          partySize: 2,
          guestName: 'Ani',
          guestPhone: '+37411223344',
          channel: 'app',
        }),
      ),
    );
  });

  it('is refused on a hold extension', async () => {
    expectInvalidRequest(
      await refusal(
        gateway().extendReservationHold({ reservationId: 'r-unknown', clientCommandId: 'tap-1' }),
      ),
    );
  });

  it('is refused on opening a tab from a booking', async () => {
    const g = gateway();
    const challenge = await g.requestPhoneCode('+37411223344');
    await g.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: challenge.devCode ?? '123456',
    });
    expectInvalidRequest(
      await refusal(g.openTabByBooking({ bookingCode: 'ABC123', commandId: 'open-1' })),
    );
  });

  it('is refused on an order', async () => {
    const g = gateway();
    const scan = await g.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t4'),
      commandId: newCommandId(),
    });
    expectInvalidRequest(
      await refusal(
        g.placeOrder({
          tabId: scan.tab.tabId,
          clientCommandId: 'order-1',
          lines: [
            {
              menuItemId: 'cappuccino',
              quantity: 1,
              isShared: false,
              participantId: scan.tab.me.participantId,
            },
          ],
        }),
      ),
    );
  });

  it('accepts any GUID the binder takes, not only a v4', async () => {
    const scan = await gateway().scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t4'),
      commandId: '11111111-1111-1111-1111-111111111111',
    });
    expect(scan.kind).toBe('tabOpened');
  });
});
