/* eslint-disable import/first, jest/no-hooks, jest/no-untyped-mock-factory, promise/avoid-new, vitest/prefer-import-in-mock -- focused component fixture */
// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({
    data: {
      pages: [
        {
          cliSessions: [
            {
              session_id: 'session-2',
              title: 'Refactor auth module',
              updated_at: '2026-09-04T10:00:00.000Z',
            },
          ],
        },
      ],
    },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn(),
  }),
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) =>
    queryKey[1] === 'active-sessions'
      ? {
          data: {
            sessions: [
              {
                connectionId: 'cloud-agent',
                id: 'session-1',
                status: 'running',
                title: 'Fix login bug',
              },
            ],
          },
          error: null,
          isError: false,
          isLoading: false,
          isRefetching: false,
          refetch: vi.fn(),
        }
      : {
          data: undefined,
          error: null,
          isError: false,
          isLoading: false,
          isRefetching: false,
          refetch: vi.fn(),
        },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('./agents-provider', () => ({
  useExtensionAgents: () => ({
    organizationId: null,
    trpcClient: {},
    userWebConnection: {
      isConnected: () => true,
      onConnectionChange: () => vi.fn(),
      onSessionEvent: () => vi.fn(),
    },
  }),
}));

import { AgentsSessionList } from './agents-session-list';

describe('session link copy feedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps only the selected copy button pending until clipboard access finishes', () => {
    const { promise: clipboardRequest } = Promise.withResolvers<void>();
    const writeText = vi.fn().mockReturnValue(clipboardRequest);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { getByRole } = render(
      <AgentsSessionList onNewSession={vi.fn()} onOpenSession={vi.fn()} />
    );
    const copyButton = getByRole('button', {
      name: 'Copy link for "Fix login bug"',
    });
    const otherCopyButton = getByRole('button', {
      name: 'Copy link for "Refactor auth module"',
    });

    fireEvent.click(copyButton);

    // eslint-disable-next-line vitest/prefer-called-times -- current linter requires CalledOnce; avoiding contradiction
    expect(writeText).toHaveBeenCalledOnce();
    expect(copyButton.hasAttribute('disabled')).toBe(true);
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    expect(copyButton.querySelector('.animate-spin')).not.toBeNull();
    expect(otherCopyButton.hasAttribute('disabled')).toBe(false);
  });

  it('restores the copy button and confirms a successful copy', async () => {
    const { promise: clipboardRequest, resolve: finishCopy } = Promise.withResolvers<void>();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockReturnValue(clipboardRequest) },
    });

    const { findByText, getByRole } = render(
      <AgentsSessionList onNewSession={vi.fn()} onOpenSession={vi.fn()} />
    );
    const copyButton = getByRole('button', {
      name: 'Copy link for "Fix login bug"',
    });

    fireEvent.click(copyButton);
    expect(copyButton.hasAttribute('disabled')).toBe(true);

    finishCopy();
    await waitFor(() => {
      expect(copyButton.hasAttribute('disabled')).toBe(false);
    });
    expect(copyButton.getAttribute('aria-busy')).toBe('false');
    await expect(findByText('Link copied')).resolves.toBeTruthy();
  });

  it('restores the copy button after a retryable clipboard failure', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) },
    });

    const { getByRole, getByText } = render(
      <AgentsSessionList onNewSession={vi.fn()} onOpenSession={vi.fn()} />
    );
    const copyButton = getByRole('button', {
      name: 'Copy link for "Fix login bug"',
    });

    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve();
    });
    const copyError = 'Could not copy link. Allow clipboard access, then try again.';
    expect(getByText(copyError)).toBeTruthy();
    expect(copyButton.hasAttribute('disabled')).toBe(false);
    expect(copyButton.getAttribute('aria-busy')).toBe('false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getByText(copyError)).toBeTruthy();
  });
});
