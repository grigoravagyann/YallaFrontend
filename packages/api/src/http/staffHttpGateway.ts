import type { ApiClient } from '../client';
import type { StaffGateway } from '../staffGateway';
import { createStaffHttpContext } from './staff/context';
import { floorMethods } from './staff/floor';
import { approvalsMethods } from './staff/approvals';
import { preOrdersMethods } from './staff/preOrders';
import { takeawayMethods } from './staff/takeaway';
import { messagesMethods } from './staff/messages';
import { admissionMethods } from './staff/admission';
import { tabMethods } from './staff/tab';
import { ordersMethods } from './staff/orders';
import { serviceRequestsMethods } from './staff/serviceRequests';
import { transferMethods } from './staff/transfer';
import { phoneMethods } from './staff/phone';
import { billMethods } from './staff/bill';

/**
 * The counter screen's real data source.
 *
 * Every method here is a request. Nothing raises `EndpointNotWiredError` any
 * more: the endpoints the previous version reported as missing all shipped, and
 * the two a staff token genuinely cannot call are absent from `StaffGateway`
 * rather than present and failing.
 *
 * There is still no fallback to the mock when the backend is unreachable. A
 * tablet that quietly starts inventing orders and balances would look exactly
 * like one that is working, on the screen where that costs the most.
 *
 * The methods live per feature in `staff/*`, sharing `staff/context.ts`.
 */
export function createStaffHttpGateway(client: ApiClient): StaffGateway {
  const ctx = createStaffHttpContext(client);

  return {
    ...floorMethods(ctx),
    ...approvalsMethods(ctx),
    ...preOrdersMethods(ctx),
    ...takeawayMethods(ctx),
    ...messagesMethods(ctx),
    ...admissionMethods(ctx),
    ...tabMethods(ctx),
    ...ordersMethods(ctx),
    ...serviceRequestsMethods(ctx),
    ...transferMethods(ctx),
    ...phoneMethods(ctx),
    ...billMethods(ctx),
  };
}
