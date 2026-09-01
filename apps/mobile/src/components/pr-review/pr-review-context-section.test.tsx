/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to test React/RN structure under vitest */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactI18next from 'react-i18next';

import { formatDate } from '@/lib/format';

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
  formatDate: vi.fn((date: Date) => date.toISOString()),
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

function textNodes(
  renderer: TestRenderer.ReactTestRenderer,
  value: string
): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    node =>
      typeof node.type === 'string' &&
      (node.type as string) === 'Text' &&
      node.props.children === value
  );
}

function hasText(renderer: TestRenderer.ReactTestRenderer, value: string): boolean {
  return textNodes(renderer, value).length > 0;
}

function parentClassName(node: TestRenderer.ReactTestInstance): string {
  const parent = node.parent;
  if (parent === null) {
    throw new Error('Expected a parent View');
  }
  return typeof parent.props.className === 'string' ? parent.props.className : '';
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

  it('formats context dates without mixing dateStyle and timeZoneName', () => {
    const renderer = render(makeOverview());
    const calls = vi.mocked(formatDate).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[2]).toEqual({
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    }
    renderer.unmount();
  });

  it('keeps the reviewer decision column on-screen when the login wants remaining width', () => {
    const renderer = render(makeOverview());

    const approved = textNodes(renderer, 'prReview.context.approved')[0];
    expect(approved).toBeDefined();
    const statusClass = parentClassName(approved);
    expect(statusClass).toContain('max-w-[60%]');
    expect(statusClass).toContain('shrink-0');

    const row = approved.parent?.parent;
    expect(row).toBeDefined();
    const authorWrap = row?.children[0] as TestRenderer.ReactTestInstance;
    expect(authorWrap.props.className).toContain('min-w-0');
    expect(authorWrap.props.className).toContain('flex-1');

    renderer.unmount();
  });

  it('omits a time next to an awaiting reviewer', () => {
    const renderer = render(makeOverview());

    const awaiting = textNodes(renderer, 'prReview.context.awaiting')[0];
    expect(awaiting).toBeDefined();
    const statusCol = awaiting.parent;
    expect(statusCol).not.toBeNull();
    const labels = statusCol
      ?.findAll(node => typeof node.type === 'string' && (node.type as string) === 'Text')
      .map(node => node.props.children);
    expect(labels).toEqual(['prReview.context.awaiting']);

    renderer.unmount();
  });

  it('renders a dismissed reviewer with the dismissed time, never approved', () => {
    const overview = makeOverview();
    overview.reviews = [
      {
        author: { login: 'dave', avatarUrl: 'https://avatars.example/dave' },
        state: 'DISMISSED',
        submittedAt: '2026-01-05T00:00:00Z',
      },
    ];
    overview.requestedReviewers = [];
    overview.requestedTeams = [];
    const renderer = render(overview);

    expect(hasText(renderer, 'dave')).toBe(true);
    expect(hasText(renderer, 'prReview.context.dismissed')).toBe(true);
    expect(hasText(renderer, 'prReview.context.approved')).toBe(false);
    expect(hasText(renderer, '2026-01-05T00:00:00.000Z')).toBe(true);

    renderer.unmount();
  });

  it('renders a re-requested reviewer as awaiting, never approved', () => {
    const overview = makeOverview();
    overview.requestedReviewers = [{ login: 'bob', avatarUrl: 'https://avatars.example/bob' }];
    overview.requestedTeams = [];
    const renderer = render(overview);

    expect(hasText(renderer, 'bob')).toBe(true);
    expect(hasText(renderer, 'prReview.context.awaiting')).toBe(true);
    expect(hasText(renderer, 'prReview.context.approved')).toBe(false);

    renderer.unmount();
  });

  it('truncates a long reviewer login instead of overlapping the decision column', () => {
    const login = 'a-very-long-reviewer-login-name-that-must-truncate';
    const overview = makeOverview();
    overview.reviews = [
      {
        author: { login, avatarUrl: 'https://avatars.example/long' },
        state: 'APPROVED',
        submittedAt: '2026-01-03T00:00:00Z',
      },
    ];
    overview.requestedReviewers = [];
    overview.requestedTeams = [];
    const renderer = render(overview);

    const loginNode = textNodes(renderer, login)[0];
    expect(loginNode).toBeDefined();
    expect(loginNode.props.numberOfLines).toBe(1);
    expect(loginNode.props.className).toContain('min-w-0');
    expect(loginNode.props.className).toContain('flex-1');
    expect(parentClassName(textNodes(renderer, 'prReview.context.approved')[0])).toContain(
      'shrink-0'
    );

    renderer.unmount();
  });
});
