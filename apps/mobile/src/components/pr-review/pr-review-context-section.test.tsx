/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to test React/RN structure under vitest */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactI18next from 'react-i18next';

import { PrReviewContextSection } from './pr-review-context-section';

vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
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

vi.mock('@/components/ui/icons', () => ({ ExternalLink: 'ExternalLink' }));
vi.mock('@/components/ui/image', () => ({ Image: 'Image' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

vi.mock('@/lib/format', () => ({
  formatDate: (date: Date) => date.toISOString(),
}));

vi.mock('@/lib/utils', () => ({
  parseTimestamp: (iso: string) => new Date(iso),
  timeAgo: () => '2 days ago',
}));

vi.mock('@/lib/external-link', () => ({ openExternalUrl: vi.fn() }));

type Overview = Parameters<typeof PrReviewContextSection>[0]['overview'];

function makeOverview(): Overview {
  return {
    labels: [
      { name: 'bug', color: 'ff0000' },
      { name: 'needs-review', color: null },
    ],
    assignees: [{ login: 'alice', avatarUrl: 'https://avatars.example/alice' }],
    requestedReviewers: [{ login: 'alice', avatarUrl: 'https://avatars.example/alice' }],
    requestedTeams: [{ name: 'core-team', slug: 'core-team' }],
    reviews: [
      {
        author: { login: 'bob', avatarUrl: 'https://avatars.example/bob' },
        state: 'APPROVED',
        submittedAt: '2026-01-03T00:00:00Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    closedAt: null,
    mergedAt: '2026-01-04T00:00:00Z',
    mergedBy: { login: 'carol', avatarUrl: 'https://avatars.example/carol' },
    linkedIssues: [
      {
        number: 42,
        title: 'Fix the flux',
        state: 'OPEN',
        url: 'https://github.com/kilo/flux/issues/42',
      },
    ],
  } as unknown as Overview;
}

function render(overview: Overview): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      createElement(PrReviewContextSection, {
        owner: 'kilo',
        repo: 'flux',
        number: 12,
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

describe('PrReviewContextSection', () => {
  it('renders labels, assignees, dates, merged-by, and linked issues', () => {
    const renderer = render(makeOverview());

    expect(hasText(renderer, 'prReview.context.labels')).toBe(true);
    expect(hasText(renderer, 'bug')).toBe(true);
    expect(hasText(renderer, 'needs-review')).toBe(true);

    expect(hasText(renderer, 'prReview.context.assignees')).toBe(true);
    expect(hasText(renderer, 'alice')).toBe(true);

    expect(hasText(renderer, 'prReview.context.opened')).toBe(true);
    expect(hasText(renderer, 'prReview.context.updated')).toBe(true);
    expect(hasText(renderer, 'prReview.context.merged')).toBe(true);
    expect(hasText(renderer, '2026-01-01T00:00:00.000Z')).toBe(true);

    expect(hasText(renderer, 'prReview.context.mergedBy')).toBe(true);
    expect(hasText(renderer, 'carol')).toBe(true);

    expect(hasText(renderer, 'prReview.context.linkedIssues')).toBe(true);
    expect(hasText(renderer, '#42')).toBe(true);
    expect(hasText(renderer, 'Fix the flux')).toBe(true);

    renderer.unmount();
  });

  it('marks the linked-issue row as a link', () => {
    const renderer = render(makeOverview());

    const links = renderer.root.findAll(
      node =>
        typeof node.type === 'string' &&
        (node.type as string) === 'Pressable' &&
        node.props.accessibilityRole === 'link'
    );
    expect(links).toHaveLength(1);

    renderer.unmount();
  });

  it('renders reviewer decisions and teams', () => {
    const renderer = render(makeOverview());

    expect(hasText(renderer, 'prReview.context.reviewers')).toBe(true);
    expect(hasText(renderer, 'prReview.context.approved')).toBe(true);
    expect(hasText(renderer, 'prReview.context.awaiting')).toBe(true);
    expect(hasText(renderer, 'prReview.context.team')).toBe(true);
    expect(hasText(renderer, 'core-team')).toBe(true);
    // bob is only in `reviews` (no longer requested), so his approved decision
    // renders its exact submission time.
    expect(hasText(renderer, '2026-01-03T00:00:00.000Z')).toBe(true);

    renderer.unmount();
  });
});
