// Pure derivation of per-reviewer decisions for the PR context section.
// No React, no react-query, no expo modules — plain Node, so the selector
// is testable in isolation (mirrors classify-pr-review-query-state.ts).

export type ReviewAuthor = {
  login: string;
  avatarUrl: string | null;
};

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING';

export type Review = {
  author: ReviewAuthor | null;
  state: ReviewState;
  submittedAt: string | null;
};

export type RequestedTeam = {
  name: string;
  slug: string;
};

// The decision kinds the context section renders as text. GitHub's PENDING
// state (a review started but not yet submitted) is not a decision, so it is
// normalized to `awaiting` instead of getting its own kind.
export type DecisionKind =
  | 'approved'
  | 'changesRequested'
  | 'commented'
  | 'dismissed'
  | 'awaiting';

export type ReviewDecision =
  | { kind: 'approved'; submittedAt: string | null }
  | { kind: 'changesRequested'; submittedAt: string | null }
  | { kind: 'commented'; submittedAt: string | null }
  | { kind: 'dismissed'; submittedAt: string | null }
  | { kind: 'awaiting' };

export type UserReviewDecision = {
  kind: 'user';
  login: string;
  avatarUrl: string | null;
  decision: ReviewDecision;
};

export type TeamReviewDecision = {
  kind: 'team';
  name: string;
  slug: string;
};

export type DerivedReviewDecision = UserReviewDecision | TeamReviewDecision;

// The terminal GitHub review states, mapped verbatim. DISMISSED must never
// read as an approval (or as awaiting), so it keeps its own kind.
const DECISION_KIND_BY_STATE = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changesRequested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
} satisfies Record<Exclude<ReviewState, 'PENDING'>, DecisionKind>;

function decisionFor(review: Review): ReviewDecision {
  if (review.state === 'PENDING') {
    return { kind: 'awaiting' };
  }
  return { kind: DECISION_KIND_BY_STATE[review.state], submittedAt: review.submittedAt };
}

function isMoreRecent(candidate: Review, current: Review): boolean {
  const candidateTime = candidate.submittedAt === null ? null : Date.parse(candidate.submittedAt);
  const currentTime = current.submittedAt === null ? null : Date.parse(current.submittedAt);
  if (candidateTime !== null && currentTime !== null) {
    return candidateTime > currentTime;
  }
  // A submitted review (non-null submittedAt) beats an in-progress PENDING
  // review (null). Two null timestamps fall back to array order: a later
  // element wins.
  if (candidateTime !== null) {
    return true;
  }
  if (currentTime !== null) {
    return false;
  }
  return true;
}

export function deriveReviewDecisions(
  reviews: readonly Review[],
  requestedReviewers: readonly ReviewAuthor[],
  requestedTeams: readonly RequestedTeam[]
): DerivedReviewDecision[] {
  const decisions: DerivedReviewDecision[] = [];

  for (const reviewer of requestedReviewers) {
    const ownReviews = reviews.filter(review => review.author?.login === reviewer.login);
    let latest: Review | undefined = undefined;
    for (const review of ownReviews) {
      if (latest === undefined || isMoreRecent(review, latest)) {
        latest = review;
      }
    }
    decisions.push({
      kind: 'user',
      login: reviewer.login,
      avatarUrl: reviewer.avatarUrl,
      decision: latest === undefined ? { kind: 'awaiting' } : decisionFor(latest),
    });
  }

  for (const team of requestedTeams) {
    decisions.push({ kind: 'team', name: team.name, slug: team.slug });
  }

  return decisions;
}
