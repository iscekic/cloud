import { describe, expect, it } from 'vitest';

import {
  deriveMergeRequirements,
  type MergeCheckRunDto,
  type MergeRequirementsDto,
  type MergeReviewDto,
} from './merge-requirements';

function requirements(overrides: Partial<MergeRequirementsDto> = {}): MergeRequirementsDto {
  return {
    status: 'present',
    requiredApprovingReviewCount: 1,
    requiredStatusCheckContexts: [],
    requireCodeOwnerReviews: null,
    enforceAdmins: null,
    ...overrides,
  };
}

function run(overrides: Partial<MergeCheckRunDto> = {}): MergeCheckRunDto {
  return {
    name: 'ci',
    status: 'completed',
    conclusion: 'success',
    detailsUrl: null,
    appName: null,
    ...overrides,
  };
}

function review(overrides: Partial<MergeReviewDto> = {}): MergeReviewDto {
  return {
    author: { login: 'alice', avatarUrl: null },
    state: 'APPROVED',
    submittedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('deriveMergeRequirements', () => {
  it('returns kind absent for status absent', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ status: 'absent' }),
      checkRuns: [run()],
      reviews: [review()],
      requestedReviewers: [],
    });

    expect(result.kind).toBe('absent');
    expect(result.reviewRequired).toBeNull();
    expect(result.reviewSatisfied).toBe(0);
    expect(result.checks).toEqual([]);
  });

  it('returns kind unavailable for status unavailable', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ status: 'unavailable' }),
      checkRuns: [run()],
      reviews: [review()],
      requestedReviewers: [],
    });

    expect(result.kind).toBe('unavailable');
    expect(result.reviewRequired).toBeNull();
    expect(result.checks).toEqual([]);
  });

  it('returns kind present with the review requirement for status present', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredApprovingReviewCount: 2 }),
      checkRuns: [],
      reviews: [review()],
      requestedReviewers: [],
    });

    expect(result.kind).toBe('present');
    expect(result.reviewRequired).toBe(2);
  });

  it('marks a required check with no run as missing, so it reads as unmet', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredStatusCheckContexts: ['ci', 'lint'] }),
      checkRuns: [run({ name: 'ci' })],
      reviews: [],
      requestedReviewers: [],
    });

    expect(result.checks).toEqual([
      { name: 'ci', required: true, state: 'success' },
      { name: 'lint', required: true, state: 'missing' },
    ]);
  });

  it('classifies failing and not-completed required checks', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredStatusCheckContexts: ['ci', 'lint', 'audit'] }),
      checkRuns: [
        run({ name: 'ci', conclusion: 'failure' }),
        run({ name: 'lint', status: 'in_progress', conclusion: null }),
        run({ name: 'audit', conclusion: 'success' }),
      ],
      reviews: [],
      requestedReviewers: [],
    });

    expect(result.checks).toEqual([
      { name: 'ci', required: true, state: 'failure' },
      { name: 'lint', required: true, state: 'pending' },
      { name: 'audit', required: true, state: 'success' },
    ]);
  });

  it('includes only failing optional checks, marked required:false, never blockers', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredStatusCheckContexts: ['ci'] }),
      checkRuns: [
        run({ name: 'ci' }),
        run({ name: 'coverage', conclusion: 'failure' }),
        run({ name: 'lint', conclusion: 'success' }),
        run({ name: 'e2e', status: 'in_progress', conclusion: null }),
      ],
      reviews: [],
      requestedReviewers: [],
    });

    expect(result.checks).toEqual([
      { name: 'ci', required: true, state: 'success' },
      { name: 'coverage', required: false, state: 'failure' },
    ]);
  });

  it('orders required checks first, then failing optional checks', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredStatusCheckContexts: ['lint', 'ci'] }),
      checkRuns: [
        run({ name: 'coverage', conclusion: 'failure' }),
        run({ name: 'ci' }),
        run({ name: 'lint', conclusion: 'failure' }),
      ],
      reviews: [],
      requestedReviewers: [],
    });

    expect(result.checks.map(check => check.name)).toEqual(['lint', 'ci', 'coverage']);
    expect(result.checks.map(check => check.required)).toEqual([true, true, false]);
  });

  it('counts distinct approving reviewers', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredApprovingReviewCount: 2 }),
      checkRuns: [],
      reviews: [
        review({ author: { login: 'alice', avatarUrl: null } }),
        review({ author: { login: 'bob', avatarUrl: null } }),
      ],
      requestedReviewers: [],
    });

    expect(result.reviewSatisfied).toBe(2);
  });

  it('excludes dismissed reviews and counts only each reviewer latest state', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredApprovingReviewCount: 2 }),
      checkRuns: [],
      reviews: [
        review({
          author: { login: 'alice', avatarUrl: null },
          state: 'APPROVED',
          submittedAt: '2026-01-01T00:00:00Z',
        }),
        review({
          author: { login: 'alice', avatarUrl: null },
          state: 'DISMISSED',
          submittedAt: '2026-01-02T00:00:00Z',
        }),
        review({ author: { login: 'bob', avatarUrl: null }, state: 'DISMISSED' }),
        review({ author: { login: 'carol', avatarUrl: null }, state: 'APPROVED' }),
      ],
      requestedReviewers: [],
    });

    // alice's latest is DISMISSED, bob is DISMISSED, only carol approves.
    expect(result.reviewSatisfied).toBe(1);
  });

  it('does not count a repeated approval twice for the same reviewer', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredApprovingReviewCount: 1 }),
      checkRuns: [],
      reviews: [
        review({ submittedAt: '2026-01-01T00:00:00Z' }),
        review({ submittedAt: '2026-01-02T00:00:00Z' }),
      ],
      requestedReviewers: [],
    });

    expect(result.reviewSatisfied).toBe(1);
  });

  it('ignores reviews from a null author', () => {
    const result = deriveMergeRequirements({
      requirements: requirements({ requiredApprovingReviewCount: 1 }),
      checkRuns: [],
      reviews: [review({ author: null })],
      requestedReviewers: [],
    });

    expect(result.reviewSatisfied).toBe(0);
  });

  it('does not count an approving reviewer with an outstanding review request', () => {
    const result = deriveMergeRequirements({
      requirements: requirements(),
      checkRuns: [],
      reviews: [review()],
      requestedReviewers: [{ login: 'alice' }],
    });

    expect(result.reviewSatisfied).toBe(0);
  });

  it('counts an approving reviewer who is no longer requested', () => {
    const result = deriveMergeRequirements({
      requirements: requirements(),
      checkRuns: [],
      reviews: [review()],
      requestedReviewers: [],
    });

    expect(result.reviewSatisfied).toBe(1);
  });
});
