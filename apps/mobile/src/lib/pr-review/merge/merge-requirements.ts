// Pure selector: derives the exact merge requirements (approvals + status
// checks) from the overview mergeRequirements, the listChecks runs, and the
// PR reviews. No React, no react-query, no expo modules — plain Node, so the
// selector is testable in isolation (mirrors merge-blocked-reasons.ts and
// review-decisions.ts).

import { type inferRouterOutputs, type MobileRouter } from '@kilocode/trpc/mobile';

type RouterOutputs = inferRouterOutputs<MobileRouter>;

export type MergeRequirementsDto =
  RouterOutputs['githubPrReview']['getPullRequest']['mergeRequirements'];
export type MergeReviewDto = RouterOutputs['githubPrReview']['getPullRequest']['reviews'][number];
export type MergeCheckRunDto = RouterOutputs['githubPrReview']['listChecks']['checkRuns'][number];

export type MergeRequirementCheckState = 'success' | 'failure' | 'pending' | 'missing';

export type MergeRequirementCheck = {
  name: string;
  required: boolean;
  state: MergeRequirementCheckState;
};

export type MergeRequirementsResult = {
  kind: 'absent' | 'unavailable' | 'present';
  /** The required approving review count; null when unknown or unset. */
  reviewRequired: number | null;
  /** Distinct reviewers whose latest review state is APPROVED. */
  reviewSatisfied: number;
  /** Required checks first (in context order), then failing optional checks. */
  checks: MergeRequirementCheck[];
};

// Conclusions that mean "completed without passing". Mirrors the server rollup
// (`rollupState` in apps/web mappers.ts) plus GitHub's `startup_failure`.
const FAILING_CONCLUSIONS = new Set([
  'failure',
  'startup_failure',
  'error',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
]);

function checkState(run: MergeCheckRunDto): Exclude<MergeRequirementCheckState, 'missing'> {
  if (run.status !== 'completed') {
    return 'pending';
  }
  if (run.conclusion === 'success') {
    return 'success';
  }
  if (run.conclusion !== null && FAILING_CONCLUSIONS.has(run.conclusion)) {
    return 'failure';
  }
  // neutral / skipped / null / unknown conclusion: not a pass, not a definite
  // failure — keep it unresolved so it never reads as passed.
  return 'pending';
}

function isMoreRecent(candidate: MergeReviewDto, current: MergeReviewDto): boolean {
  const candidateTime = candidate.submittedAt === null ? null : Date.parse(candidate.submittedAt);
  const currentTime = current.submittedAt === null ? null : Date.parse(current.submittedAt);
  if (candidateTime !== null && currentTime !== null) {
    return candidateTime > currentTime;
  }
  // A submitted review beats an in-progress (null) one; two null timestamps
  // fall back to array order (a later element wins) — same as review-decisions.ts.
  if (candidateTime !== null) {
    return true;
  }
  if (currentTime !== null) {
    return false;
  }
  return true;
}

function countApprovingReviewers(reviews: readonly MergeReviewDto[]): number {
  const latestByLogin = new Map<string, MergeReviewDto>();
  for (const review of reviews) {
    const login = review.author?.login;
    if (login) {
      const current = latestByLogin.get(login);
      if (current === undefined || isMoreRecent(review, current)) {
        latestByLogin.set(login, review);
      }
    }
  }
  let satisfied = 0;
  for (const latest of latestByLogin.values()) {
    if (latest.state === 'APPROVED') {
      satisfied += 1;
    }
  }
  return satisfied;
}

export function deriveMergeRequirements(args: {
  requirements: MergeRequirementsDto;
  checkRuns: readonly MergeCheckRunDto[];
  reviews: readonly MergeReviewDto[];
}): MergeRequirementsResult {
  const { requirements, checkRuns, reviews } = args;

  if (requirements.status === 'absent') {
    return { kind: 'absent', reviewRequired: null, reviewSatisfied: 0, checks: [] };
  }
  if (requirements.status === 'unavailable') {
    return { kind: 'unavailable', reviewRequired: null, reviewSatisfied: 0, checks: [] };
  }

  const requiredNames = new Set(requirements.requiredStatusCheckContexts);
  const checks: MergeRequirementCheck[] = [];

  // Required checks first, in context order. A required context with no
  // matching run still appears (as `missing`) so incomplete data can never
  // read as "all passed".
  for (const name of requirements.requiredStatusCheckContexts) {
    const run = checkRuns.find(candidate => candidate.name === name);
    checks.push({
      name,
      required: true,
      state: run === undefined ? 'missing' : checkState(run),
    });
  }

  // Failing optional checks only — informational, never a blocker. Passing or
  // pending optional checks are not interesting here and are omitted.
  for (const run of checkRuns) {
    if (!requiredNames.has(run.name)) {
      const state = checkState(run);
      if (state === 'failure') {
        checks.push({ name: run.name, required: false, state });
      }
    }
  }

  return {
    kind: 'present',
    reviewRequired: requirements.requiredApprovingReviewCount,
    reviewSatisfied: countApprovingReviewers(reviews),
    checks,
  };
}
