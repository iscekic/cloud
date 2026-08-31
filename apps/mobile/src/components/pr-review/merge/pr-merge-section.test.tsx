/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to test React/RN structure under vitest */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactI18next from 'react-i18next';

import { type PrOverviewDto } from '@/lib/pr-review/merge/merge-blocked-reasons';
import { PrMergeSection } from './pr-merge-section';

vi.mock('react-native', () => ({
  View: 'View',
  useColorScheme: () => 'light',
}));

vi.mock('expo-router', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof ReactI18next>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/components/ui/icons', () => ({
  GitMerge: 'GitMerge',
}));

vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));

vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

vi.mock('@/lib/pr-review/merge/use-pr-merge-mutations', () => ({
  useUpdateBranchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDisableAutoMergeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/pr-review/merge/pr-merge-section-parts', () => ({
  AutoMergeEnabledBanner: 'AutoMergeEnabledBanner',
  BlockedPanel: 'BlockedPanel',
  MergeabilityCheckingRow: 'MergeabilityCheckingRow',
  MergeabilityTimedOutRow: 'MergeabilityTimedOutRow',
  TerminalChip: 'TerminalChip',
}));

// The section under test must render `PrMergeRequirementsSection` in every
// non-terminal branch. Stub it so this suite asserts its presence in the
// rendered tree without pulling in its query/i18n dependency chain.
vi.mock('@/components/pr-review/merge/pr-merge-requirements-section', () => ({
  PrMergeRequirementsSection: 'PrMergeRequirementsSection',
}));

function makeOverview(overrides: Partial<PrOverviewDto> = {}): PrOverviewDto {
  return {
    number: 1,
    title: 'Title',
    bodyMarkdown: null,
    author: null,
    state: 'open',
    draft: false,
    baseRef: 'main',
    headRef: 'feature/x',
    isCrossRepo: false,
    headRepoFullName: null,
    headSha: 'abc123',
    prNodeId: 'pr-node-1',
    counts: { commits: 1, changedFiles: 1, additions: 1, deletions: 0 },
    mergeable: true,
    mergeableState: 'clean',
    autoMerge: null,
    reviewDecision: null,
    repo: {
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: false,
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
      allowUpdateBranch: true,
      viewerCanPush: true,
      viewerCanAdmin: true,
      viewerLogin: null,
    },
    labels: [],
    assignees: [],
    requestedReviewers: [],
    requestedTeams: [],
    reviews: [],
    createdAt: '',
    updatedAt: '',
    closedAt: null,
    mergedAt: null,
    mergedBy: null,
    linkedIssues: [],
    mergeQueue: null,
    mergeRequirements: {
      status: 'absent',
      requiredApprovingReviewCount: null,
      requiredStatusCheckContexts: [],
      requireCodeOwnerReviews: null,
      enforceAdmins: null,
    },
    ...overrides,
  };
}

function render(overview: PrOverviewDto): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      createElement(PrMergeSection, {
        owner: 'kilo',
        repo: 'flux',
        overview,
        onRefetch: vi.fn().mockResolvedValue(undefined),
        isRefetching: false,
      })
    );
  });
  // eslint-disable-next-line typescript-eslint/no-unnecessary-condition
  if (!renderer) {
    throw new Error('Failed to create test renderer');
  }
  return renderer;
}

function hasType(renderer: TestRenderer.ReactTestRenderer, type: string): boolean {
  return (
    renderer.root.findAll(
      node => typeof node.type === 'string' && (node.type as string) === type
    ).length > 0
  );
}

describe('PrMergeSection', () => {
  it('renders the requirements section when auto-merge is active and the PR is mergeable', () => {
    const renderer = render(
      makeOverview({
        mergeable: true,
        mergeableState: 'clean',
        autoMerge: { method: 'squash' },
      })
    );

    expect(hasType(renderer, 'PrMergeRequirementsSection')).toBe(true);
    expect(hasType(renderer, 'AutoMergeEnabledBanner')).toBe(true);

    renderer.unmount();
  });

  it('renders the requirements section when auto-merge is active and the PR is blocked', () => {
    const renderer = render(
      makeOverview({
        mergeable: false,
        mergeableState: 'blocked',
        autoMerge: { method: 'squash' },
      })
    );

    expect(hasType(renderer, 'PrMergeRequirementsSection')).toBe(true);
    expect(hasType(renderer, 'AutoMergeEnabledBanner')).toBe(true);

    renderer.unmount();
  });

  it('renders the requirements section when auto-merge is absent (regression)', () => {
    const renderer = render(
      makeOverview({
        mergeable: true,
        mergeableState: 'clean',
        autoMerge: null,
      })
    );

    expect(hasType(renderer, 'PrMergeRequirementsSection')).toBe(true);

    renderer.unmount();
  });
});
