import type { ServiceRequest } from '@yalla/api';

/**
 * The tab's bill requests with an amount on them — still unanswered in the
 * branch list, or answered from this device — and not yet paid against,
 * newest first.
 *
 * One per person: a new request from somebody replaces their earlier one
 * (the server drops the superseded one from its list; a copy this device
 * kept after "On my way" is dropped here the same way).
 */
export function billRequestsForTab(
  tabId: string | null,
  branchRequests: readonly ServiceRequest[] | undefined,
  acknowledgedBills: ReadonlyMap<string, ServiceRequest>,
  settledBillIds: ReadonlySet<string>,
): readonly ServiceRequest[] {
  if (!tabId) return [];
  const byId = new Map<string, ServiceRequest>();
  for (const request of [
    ...(branchRequests ?? []).filter(
      (candidate) => candidate.tabId === tabId && candidate.reason === 'bill',
    ),
    ...[...acknowledgedBills.values()].filter((candidate) => candidate.tabId === tabId),
  ]) {
    if (request.bill !== null && !settledBillIds.has(request.id) && !byId.has(request.id)) {
      byId.set(request.id, request);
    }
  }
  const newestFirst = [...byId.values()].sort((a, b) =>
    b.requestedAtUtc.localeCompare(a.requestedAtUtc),
  );
  const seen = new Set<string>();
  return newestFirst.filter((request) => {
    const who = request.requestedByParticipantId;
    if (who === null) return true;
    if (seen.has(who)) return false;
    seen.add(who);
    return true;
  });
}
