// Pure derivation of per-reviewer decisions for the PR context section.
// No React, no react-query, no expo modules — plain Node, so the selector
// is testable in isolation (mirrors classify-pr-review-query-state.ts).

export type ReviewAuthor = {
  login: string;
  avatarUrl: string | null;
};

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';

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
export type DecisionKind = 'approved' | 'changesRequested' | 'commented' | 'dismissed' | 'awaiting';

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
  // A review with a submittedAt beats one without. Two null timestamps fall
  // back to array order: a later element wins.
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
  const submitted: UserReviewDecision[] = [];
  const awaiting: UserReviewDecision[] = [];
  const teams: TeamReviewDecision[] = [];

  const requestedLogins = new Set(requestedReviewers.map(reviewer => reviewer.login));

  // Keep the latest terminal (non-PENDING) review per author, regardless of
  // whether they are still requested. A dismissed review is a terminal
  // decision, so it must not be wiped by an outstanding request.
  const latestByLogin = new Map<string, { author: ReviewAuthor; review: Review }>();
  for (const review of reviews) {
    const author = review.author;
    if (author !== null && review.state !== 'PENDING') {
      const current = latestByLogin.get(author.login);
      if (current === undefined || isMoreRecent(review, current.review)) {
        latestByLogin.set(author.login, { author, review });
      }
    }
  }

  // A reviewer who submitted and is no longer requested still counts: keep
  // their latest submitted review. A reviewer who is still requested counts
  // only when that latest review is DISMISSED — an outstanding request
  // otherwise supersedes an earlier APPROVED / CHANGES_REQUESTED / COMMENTED
  // decision, which re-reads as awaiting.
  const dismissedLogins = new Set<string>();
  for (const { author, review } of latestByLogin.values()) {
    const stillRequested = requestedLogins.has(author.login);
    const requestOutranks = stillRequested && review.state !== 'DISMISSED';
    if (!requestOutranks) {
      if (stillRequested) {
        dismissedLogins.add(author.login);
      }
      submitted.push({
        kind: 'user',
        login: author.login,
        avatarUrl: author.avatarUrl,
        decision: decisionFor(review),
      });
    }
  }

  for (const reviewer of requestedReviewers) {
    if (!dismissedLogins.has(reviewer.login)) {
      awaiting.push({
        kind: 'user',
        login: reviewer.login,
        avatarUrl: reviewer.avatarUrl,
        decision: { kind: 'awaiting' },
      });
    }
  }

  for (const team of requestedTeams) {
    teams.push({ kind: 'team', name: team.name, slug: team.slug });
  }

  return [...submitted, ...awaiting, ...teams];
}
