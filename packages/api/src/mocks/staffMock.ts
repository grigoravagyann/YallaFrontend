import type { StaffGateway } from '../staffGateway';
import { createStaffMockContext, type StaffMockOptions } from './staff/context';
import { floorMethods } from './staff/floor';
import { approvalsMethods } from './staff/approvals';
import { preOrdersMethods } from './staff/preOrders';
import { messagesMethods } from './staff/messages';
import { takeawayMethods } from './staff/takeaway';
import { admissionMethods } from './staff/admission';
import { tabMethods } from './staff/tab';
import { ordersMethods } from './staff/orders';
import { serviceRequestsMethods } from './staff/serviceRequests';
import { transferMethods } from './staff/transfer';
import { phoneMethods } from './staff/phone';
import { billMethods } from './staff/bill';

export type { StaffMockOptions, StaffPreOrderSeed, StaffTakeawaySeed } from './staff/context';

export function createStaffMockGateway(options: StaffMockOptions = {}): StaffGateway {
  const ctx = createStaffMockContext(options);

  return {
    ...floorMethods(ctx),
    ...approvalsMethods(ctx),
    ...preOrdersMethods(ctx),
    ...messagesMethods(ctx),
    ...takeawayMethods(ctx),
    ...admissionMethods(ctx),
    ...tabMethods(ctx),
    ...ordersMethods(ctx),
    ...serviceRequestsMethods(ctx),
    ...transferMethods(ctx),
    ...phoneMethods(ctx),
    ...billMethods(ctx),
  };
}
