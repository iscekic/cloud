/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to test React/RN structure under vitest */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactI18next from 'react-i18next';

import { InboxRow } from './pr-review-inbox-list';

vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  useColorScheme: () => 'light',
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof ReactI18next>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
vi.mock('@/components/empty-state', () => ({ EmptyState: 'EmptyState' }));
vi.mock('@/components/query-error', () => ({ QueryError: 'QueryError' }));
vi.mock('@/components/pr-review/pr-review-reconnect-notice', () => ({
  PrReviewReconnectNotice: 'PrReviewReconnectNotice',
}));
vi.mock('@/components/pr-review/pr-review-inbox-view', () => ({
  selectPrInboxView: vi.fn(),
}));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/directional-icons', () => ({
  DirectionalChevronRight: 'DirectionalChevronRight',
}));
vi.mock('@/components/ui/icons', () => ({
  Clock: 'Clock',
  GitPullRequest: 'GitPullRequest',
  Inbox: 'Inbox',
}));
vi.mock('@/components/ui/image', () => ({ Image: 'Image' }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: 'Skeleton' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/lib/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({ mutedForeground: '#6F6A61' }),
}));
vi.mock('@/lib/profile-agent-navigation', () => ({
  getPrReviewPath: () => '/pr-review/octocat/hello/7',
}));
vi.mock('@/lib/pr-review/use-pr-inbox', () => ({
  usePrInbox: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({
  parseTimestamp: (iso: string) => new Date(iso),
  timeAgo: () => '2 days ago',
}));

type InboxItem = Parameters<typeof InboxRow>[0]['item'];

const baseItem: InboxItem = {
  owner: 'octocat',
  repo: 'hello',
  number: 7,
  title: 'Fix the thing',
  isDraft: false,
  updatedAt: '2026-01-03T00:00:00Z',
  author: null,
};

function render(item: InboxItem): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(createElement(InboxRow, { item }));
  });
  // eslint-disable-next-line typescript-eslint/no-unnecessary-condition
  if (!renderer) {
    throw new Error('Failed to create test renderer');
  }
  return renderer;
}

function findText(renderer: TestRenderer.ReactTestRenderer, value: string): boolean {
  return (
    renderer.root.findAll(
      node =>
        typeof node.type === 'string' &&
        (node.type as string) === 'Text' &&
        node.props.children === value
    ).length > 0
  );
}

function findAvatarImage(renderer: TestRenderer.ReactTestRenderer): boolean {
  return (
    renderer.root.findAll(
      node =>
        typeof node.type === 'string' &&
        (node.type as string) === 'Image' &&
        (node.props.source as { uri?: string } | undefined)?.uri === 'https://avatars.example/alice'
    ).length > 0
  );
}

describe('InboxRow author line', () => {
  it('renders the author avatar and login', () => {
    const renderer = render({
      ...baseItem,
      author: { login: 'alice', avatarUrl: 'https://avatars.example/alice' },
    });

    expect(findAvatarImage(renderer)).toBe(true);
    expect(findText(renderer, 'alice')).toBe(true);

    renderer.unmount();
  });

  it('keeps the owner/repo/number accessibility label with an author', () => {
    const renderer = render({
      ...baseItem,
      author: { login: 'alice', avatarUrl: 'https://avatars.example/alice' },
    });

    const row = renderer.root.findAll(
      node => typeof node.type === 'string' && (node.type as string) === 'Pressable'
    )[0];
    expect(row?.props.accessibilityLabel).toBe('octocat/hello#7');

    renderer.unmount();
  });

  it('renders the unknown-author text for a null author', () => {
    const renderer = render(baseItem);

    expect(findText(renderer, 'prReview.overview.unknownAuthor')).toBe(true);
    expect(findAvatarImage(renderer)).toBe(false);

    renderer.unmount();
  });
});
