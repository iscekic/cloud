/* eslint-disable jest/max-expects, promise/avoid-new -- one flow needs many focus assertions; the debounce flush needs a real-timer sleep */
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AgentsMode } from './agents-mode';
import type { ExtensionAgentsContextValue } from './agents-provider';

/**
 * The provider value must be reachable from the hoisted vi.mock factory, so it
 * lives in vi.hoisted storage and is assigned per test.
 */
const mocks = vi.hoisted(() => ({
  value: null as ExtensionAgentsContextValue | null,
}));

// eslint-disable-next-line vitest/prefer-import-in-mock, jest/no-untyped-mock-factory -- provider value is assigned per test from vi.hoisted storage
vi.mock('./agents-provider', () => ({
  useExtensionAgents: (): ExtensionAgentsContextValue => {
    if (mocks.value === null) {
      throw new Error('useExtensionAgents test value was not assigned');
    }
    return mocks.value;
  },
}));

const ACTIVE_SESSIONS = [
  {
    connectionId: 'cli-owner-1',
    gitBranch: 'fix/login',
    gitUrl: 'https://github.com/org/repo',
    id: 'ses_active0000000000000000001',
    status: 'running',
    title: 'Fix login bug',
  },
];

const HISTORY_SESSIONS = [
  {
    session_id: 'ses_hist00000000000000000001',
    title: 'Refactor auth module',
    updated_at: '2026-08-30T12:00:00.000Z',
  },
  {
    session_id: 'ses_hist00000000000000000002',
    title: 'Fix login flake',
    updated_at: '2026-08-29T12:00:00.000Z',
  },
  {
    session_id: 'ses_hist00000000000000000003',
    title: 'Configure CI',
    updated_at: '2026-08-28T12:00:00.000Z',
  },
];

const createTrpcStub = () => ({
  activeSessions: {
    list: {
      // React Query awaits the plain result, so a non-promise return is enough here.
      query: vi.fn(() => ({ sessions: ACTIVE_SESSIONS })),
    },
  },
  cliSessionsV2: {
    list: {
      query: vi.fn(() => ({ cliSessions: HISTORY_SESSIONS, nextCursor: null })),
    },
    search: {
      query: vi.fn((input: { search_string: string }) => {
        const term = input.search_string.toLowerCase();
        return {
          results: HISTORY_SESSIONS.filter(session => session.title.toLowerCase().includes(term)),
        };
      }),
    },
  },
});

const unsubscribe = (): void => {};

const createAgentsValue = (trpcClient: unknown): ExtensionAgentsContextValue => {
  const context = {
    manager: {},
    organizationId: null,
    store: {},
    trpcClient,
    userWebConnection: {
      isConnected: () => true,
      onConnectionChange: vi.fn(() => unsubscribe),
      onSessionEvent: vi.fn(() => unsubscribe),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- test double for the provider context; only trpcClient and userWebConnection are exercised
  return context as unknown as ExtensionAgentsContextValue;
};

const renderSessionList = (): void => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false },
    },
  });
  // Render through AgentsMode, the live parent of the session list; the provider it reads from is mocked above.
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AgentsMode />
      </QueryClientProvider>
    </StrictMode>
  );
};

/** Flush the 300 ms search debounce and any state updates it schedules. */
const flushDebounce = async (): Promise<void> => {
  await new Promise(resolve => {
    setTimeout(resolve, 350);
  });
};

/**
 * Reproduces the reported defect: focus the session-list search field, type
 * three characters, and confirm focus survives every keystroke whose results
 * update. The search below the 2-character minimum updates no results, so the
 * result updates happen on keystrokes 2 ('fi') and 3 ('fix').
 */
describe('agents session list search focus', () => {
  it('keeps focus on the search input while typed results update', async () => {
    const trpcClient = createTrpcStub();
    mocks.value = createAgentsValue(trpcClient);
    renderSessionList();

    // History rows render first; the search box is visible with results present.
    await screen.findByText('Refactor auth module');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the label is the search input by construction
    const input = screen.getByLabelText('Search sessions') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Keystroke 1: 'f' — below the search minimum, results do not change.
    fireEvent.change(input, { target: { value: 'f' } });
    await flushDebounce();
    expect(trpcClient.cliSessionsV2.search.query).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);

    // Keystroke 2: 'fi' — results update from history rows to search rows.
    fireEvent.change(input, { target: { value: 'fi' } });
    await waitFor(() => {
      expect(trpcClient.cliSessionsV2.search.query).toHaveBeenCalledWith(
        expect.objectContaining({ search_string: 'fi' })
      );
    });
    await screen.findByText('Fix login flake');
    expect(screen.queryByText('Refactor auth module')).toBeNull();
    expect(document.activeElement).toBe(input);

    // Keystroke 3: 'fix' — result set narrows to a single row.
    fireEvent.change(input, { target: { value: 'fix' } });
    await waitFor(() => {
      expect(trpcClient.cliSessionsV2.search.query).toHaveBeenCalledWith(
        expect.objectContaining({ search_string: 'fix' })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('Configure CI')).toBeNull();
    });
    expect(screen.getByText('Fix login flake')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });
});
