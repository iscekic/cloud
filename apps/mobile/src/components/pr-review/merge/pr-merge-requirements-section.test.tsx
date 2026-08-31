/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to test React/RN structure under vitest */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactI18next from 'react-i18next';

import { PrMergeRequirementsSection } from './pr-merge-requirements-section';

vi.mock('react-native', () => ({
  View: 'View',
  useColorScheme: () => 'light',
}));

vi.mock('expo-router', () => ({ DarkTheme: {}, DefaultTheme: {} }));

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof ReactI18next>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/components/ui/icons', () => ({
  AlertTriangle: 'AlertTriangle',
  CheckCircle2: 'CheckCircle2',
  Circle: 'Circle',
  Clock3: 'Clock3',
  Loader2: 'Loader2',
  XCircle: 'XCircle',
}));

vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

vi.mock('@/lib/utils', () => ({
  cn: (...inputs: unknown[]) => inputs.join(' '),
}));

let checksQueryResult: unknown = { data: { checkRuns: [] } };

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => checksQueryResult,
}));

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({
    githubPrReview: { listChecks: { queryOptions: () => ({}) } },
  }),
}));

type Overview = Parameters<typeof PrMergeRequirementsSection>[0]['overview'];

function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    mergeRequirements: {
      status: 'unavailable',
      requiredApprovingReviewCount: null,
      requiredStatusCheckContexts: [],
      requireCodeOwnerReviews: null,
      enforceAdmins: null,
    },
    reviews: [],
    mergeQueue: null,
    ...overrides,
  } as unknown as Overview;
}

function render(overview: Overview): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      createElement(PrMergeRequirementsSection, {
        owner: 'kilo',
        repo: 'flux',
        headSha: 'abc123',
        overview,
      })
    );
  });
  // eslint-disable-next-line typescript-eslint/no-unnecessary-condition
  if (!renderer) {
    throw new Error('Failed to create test renderer');
  }
  return renderer;
}

function hasText(renderer: TestRenderer.ReactTestRenderer, value: string): boolean {
  return (
    renderer.root.findAll(
      node =>
        typeof node.type === 'string' &&
        (node.type as string) === 'Text' &&
        node.props.children === value
    ).length > 0
  );
}

describe('PrMergeRequirementsSection', () => {
  it('renders the unknown line for unavailable requirements, not a pass', () => {
    checksQueryResult = { data: { checkRuns: [] } };
    const renderer = render(
      makeOverview({
        mergeRequirements: {
          status: 'unavailable',
          requiredApprovingReviewCount: null,
          requiredStatusCheckContexts: [],
          requireCodeOwnerReviews: null,
          enforceAdmins: null,
        },
      })
    );

    expect(hasText(renderer, 'prReview.merge.requirements.unavailable')).toBe(true);
    expect(hasText(renderer, 'prReview.merge.requirements.passed')).toBe(false);

    renderer.unmount();
  });

  it('renders the no-protection-rules line for absent requirements', () => {
    checksQueryResult = { data: { checkRuns: [] } };
    const renderer = render(
      makeOverview({
        mergeRequirements: {
          status: 'absent',
          requiredApprovingReviewCount: null,
          requiredStatusCheckContexts: [],
          requireCodeOwnerReviews: null,
          enforceAdmins: null,
        },
      })
    );

    expect(hasText(renderer, 'prReview.merge.requirements.noProtectionRules')).toBe(true);

    renderer.unmount();
  });

  it('renders the queue position and state when the PR is in the merge queue', () => {
    checksQueryResult = { data: { checkRuns: [] } };
    const renderer = render(
      makeOverview({
        mergeQueue: {
          inQueue: true,
          position: 3,
          state: 'QUEUED',
          estimatedTimeToMergeSeconds: null,
          enqueuedAt: null,
        },
      })
    );

    expect(hasText(renderer, 'prReview.merge.requirements.queueTitle')).toBe(true);
    expect(hasText(renderer, 'prReview.merge.requirements.inQueue')).toBe(true);
    expect(hasText(renderer, 'prReview.merge.requirements.queueState.QUEUED')).toBe(true);

    renderer.unmount();
  });

  it('renders position unknown when the queue position is null', () => {
    checksQueryResult = { data: { checkRuns: [] } };
    const renderer = render(
      makeOverview({
        mergeQueue: {
          inQueue: true,
          position: null,
          state: 'AWAITING_CHECKS',
          estimatedTimeToMergeSeconds: null,
          enqueuedAt: null,
        },
      })
    );

    expect(hasText(renderer, 'prReview.merge.requirements.positionUnknown')).toBe(true);
    expect(hasText(renderer, 'prReview.merge.requirements.inQueue')).toBe(false);

    renderer.unmount();
  });
});
