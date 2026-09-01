import { describe, expect, it } from 'vitest';

import { deriveReviewDecisions } from './review-decisions';

const alice = { login: 'alice', avatarUrl: 'https://avatars.example/alice' };
const bob = { login: 'bob', avatarUrl: 'https://avatars.example/bob' };
const dave = { login: 'dave', avatarUrl: 'https://avatars.example/dave' };

describe('deriveReviewDecisions', () => {
  it('attaches each reviewer their latest submitted decision by submittedAt', () => {
    const result = deriveReviewDecisions(
      [
        { author: bob, state: 'COMMENTED', submittedAt: '2026-01-01T00:00:00Z' },
        { author: bob, state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z' },
      ],
      [],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'approved', submittedAt: '2026-01-03T00:00:00Z' },
      },
    ]);
  });

  it('keeps a dismissed review dismissed — never an approval', () => {
    const result = deriveReviewDecisions(
      [
        { author: bob, state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' },
        { author: bob, state: 'DISMISSED', submittedAt: '2026-01-02T00:00:00Z' },
      ],
      [],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'dismissed', submittedAt: '2026-01-02T00:00:00Z' },
      },
    ]);
  });

  it('keeps a re-requested dismissed reviewer dismissed, never awaiting', () => {
    const result = deriveReviewDecisions(
      [
        { author: dave, state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' },
        { author: dave, state: 'DISMISSED', submittedAt: '2026-01-02T00:00:00Z' },
      ],
      [dave],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'dave',
        avatarUrl: 'https://avatars.example/dave',
        decision: { kind: 'dismissed', submittedAt: '2026-01-02T00:00:00Z' },
      },
    ]);
  });

  it('marks a requested reviewer with no review as awaiting', () => {
    const result = deriveReviewDecisions([], [alice], []);

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'alice',
        avatarUrl: 'https://avatars.example/alice',
        decision: { kind: 'awaiting' },
      },
    ]);
  });

  it('emits teams separately with no individual decision', () => {
    const result = deriveReviewDecisions([], [], [{ name: 'core-team', slug: 'core-team' }]);

    expect(result).toEqual([{ kind: 'team', name: 'core-team', slug: 'core-team' }]);
  });

  it('treats a PENDING review as awaiting (not a decision)', () => {
    const result = deriveReviewDecisions(
      [{ author: bob, state: 'PENDING', submittedAt: null }],
      [bob],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'awaiting' },
      },
    ]);
  });

  it('resolves a re-requested reviewer to awaiting (APPROVED then PENDING)', () => {
    const result = deriveReviewDecisions(
      [
        { author: bob, state: 'APPROVED', submittedAt: '2026-01-02T00:00:00Z' },
        { author: bob, state: 'PENDING', submittedAt: null },
      ],
      [bob],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'awaiting' },
      },
    ]);
  });

  it('emits a reviewer who submitted and is no longer requested', () => {
    const result = deriveReviewDecisions(
      [{ author: bob, state: 'APPROVED', submittedAt: '2026-01-02T00:00:00Z' }],
      [],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'approved', submittedAt: '2026-01-02T00:00:00Z' },
      },
    ]);
  });

  it('skips a PENDING review from a reviewer who is no longer requested', () => {
    const result = deriveReviewDecisions(
      [{ author: bob, state: 'PENDING', submittedAt: null }],
      [],
      []
    );

    expect(result).toEqual([]);
  });

  it('falls back to array order when submittedAt is null', () => {
    const result = deriveReviewDecisions(
      [
        { author: bob, state: 'COMMENTED', submittedAt: null },
        { author: bob, state: 'APPROVED', submittedAt: null },
      ],
      [],
      []
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'approved', submittedAt: null },
      },
    ]);
  });

  it('orders submitted decisions first, then awaiting, then teams', () => {
    const result = deriveReviewDecisions(
      [{ author: bob, state: 'APPROVED', submittedAt: '2026-01-02T00:00:00Z' }],
      [alice],
      [{ name: 'core-team', slug: 'core-team' }]
    );

    expect(result).toEqual([
      {
        kind: 'user',
        login: 'bob',
        avatarUrl: 'https://avatars.example/bob',
        decision: { kind: 'approved', submittedAt: '2026-01-02T00:00:00Z' },
      },
      {
        kind: 'user',
        login: 'alice',
        avatarUrl: 'https://avatars.example/alice',
        decision: { kind: 'awaiting' },
      },
      { kind: 'team', name: 'core-team', slug: 'core-team' },
    ]);
  });
});
