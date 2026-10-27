/**
 * `feature-not-enabled`, 409: the platform has not allowed this feature at the
 * branch (2026-10-27, replacing the Free/Paid tier's refusal).
 */
import { ApiError, ConcurrencyConflictError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import { problemContext, type ProblemDetails } from '../../problem';
import { BRANCH_FEATURES, branchFeatureFromCode, type BranchFeature } from '../branchFeatures';
import { TabsNotEnabledError } from './tab';

export const FEATURE_NOT_ENABLED_CODE = ProblemCodes.FeatureNotEnabled;

/**
 * The branch may not use `feature`. Not the person's mistake and not a
 * conflict to refresh away: the platform switches it on, so every surface says
 * the same thing — the venue console "Not enabled for this branch. Contact
 * SHURJ", a diner a friendly "not available here".
 *
 * A {@link ConcurrencyConflictError}, because it is a 409 and every screen that
 * already treats a 409 as "not now" keeps doing so; the class is what a screen
 * asks for when it has something better to say.
 */
export class FeatureNotEnabledError extends ConcurrencyConflictError {
  /** `null` when the server named a feature this client does not know yet. */
  readonly feature: BranchFeature | null;
  readonly branchId: string | null;

  constructor(options: {
    url: string;
    requestId?: string | undefined;
    body?: unknown;
    problem?: ProblemDetails | undefined;
    feature?: BranchFeature | null | undefined;
    branchId?: string | null | undefined;
  }) {
    super(options);
    this.message = 'That feature is not enabled for this branch.';
    this.name = 'FeatureNotEnabledError';
    const context = problemContext(options.problem, FEATURE_NOT_ENABLED_CODE);
    this.feature = options.feature ?? branchFeatureFromCode(context.feature);
    this.branchId =
      options.branchId ?? (typeof context.branchId === 'string' ? context.branchId : null);
  }
}

/**
 * The feature a refusal says is not enabled, or `undefined` when `error` is
 * not that refusal. `null` is "not enabled, feature unnamed". Reads the
 * class, the diner's older {@link TabsNotEnabledError}, and any other
 * {@link ApiError} that still carries the code — a gateway that re-threw it
 * under its own class without dropping the problem.
 */
export function blockedFeature(error: unknown): BranchFeature | null | undefined {
  if (error instanceof FeatureNotEnabledError) return error.feature;
  if (error instanceof TabsNotEnabledError) return 'tableService';
  if (error instanceof ApiError && error.code === FEATURE_NOT_ENABLED_CODE) {
    return branchFeatureFromCode(problemContext(error.problem, FEATURE_NOT_ENABLED_CODE).feature);
  }
  return undefined;
}

/** Whether `error` is a `feature-not-enabled` refusal, under whichever class it arrived. */
export function isFeatureNotEnabled(error: unknown): boolean {
  return blockedFeature(error) !== undefined;
}

/** A mock's refusal, shaped as the server's: the code and its context. */
export function featureNotEnabled(
  url: string,
  feature: BranchFeature,
  branchId: string,
): FeatureNotEnabledError {
  return new FeatureNotEnabledError({
    url,
    feature,
    branchId,
    problem: {
      type: 'about:blank',
      title: 'Feature not enabled for this branch',
      status: 409,
      detail: 'The platform has not allowed this feature at the branch.',
      code: FEATURE_NOT_ENABLED_CODE,
      traceId: 'mock',
      context: { feature: BRANCH_FEATURES.indexOf(feature) + 1, branchId },
    },
  });
}
