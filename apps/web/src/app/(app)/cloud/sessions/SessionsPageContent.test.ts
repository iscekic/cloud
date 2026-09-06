/* @jest-environment node */
/**
 * Mounted tests for the sessions page rows-vs-empty-state behavior.
 *
 * The reported bug: a failed refresh (invalidation refetch / focus refetch of
 * `cliSessionsV2.list`) must not replace the visible rows with the "No
 * sessions yet." empty state — a transient network error must not look like
 * "no sessions". The list may be declared empty only after a query completes
 * successfully.
 *
 * Real TanStack Query is used (with the app's defaults from Providers.tsx:
 * staleTime 60s, retry 1); only the trpc plumbing and leaf UI are mocked, so
 * the tests exercise the actual refetch-error data-retention semantics plus
 * the page's real render branching.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionsListItem } from '@/components/cloud-agent/SessionsList';
import { extractRepoFromGitUrl } from '@/components/cloud-agent/utils/git-utils';

const mockListFetcher = jest.fn<(input: unknown) => Promise<unknown>>();
const mockSearchFetcher = jest.fn<(input: unknown) => Promise<unknown>>();
const mockListQueryKeys: unknown[][] = [];

jest.mock('@/lib/trpc/utils', () => ({
  useTRPC: () => ({
    cliSessionsV2: {
      list: {
        queryOptions: (input: unknown) => {
          const queryKey = ['cliSessionsV2', 'list', input];
          mockListQueryKeys.push(queryKey);
          return { queryKey, queryFn: () => mockListFetcher(input) };
        },
      },
      search: {
        queryOptions: (input: unknown) => ({
          queryKey: ['cliSessionsV2', 'search', input],
          queryFn: () => mockSearchFetcher(input),
        }),
      },
      share: {
        mutationOptions: () => ({ mutationFn: () => Promise.resolve({ share_token: 'tok' }) }),
      },
      unshare: {
        mutationOptions: () => ({ mutationFn: () => Promise.resolve(undefined) }),
      },
    },
  }),
}));

jest.mock('@/components/cloud-agent/SessionsList', () => ({
  SessionsList: (props: { sessions: SessionsListItem[] }) => {
    mockCapturedSessions = props.sessions;
    return null;
  },
}));

let mockCapturedSessions: SessionsListItem[] = [];

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children?: React.ReactNode }) => children,
  SelectContent: ({ children }: { children?: React.ReactNode }) => children,
  SelectItem: ({ children }: { children?: React.ReactNode }) => children,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => children,
  SelectValue: () => null,
}));
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => children,
  DialogContent: ({ children }: { children?: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/SetPageTitle', () => ({
  SetPageTitle: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/app/share/[shareId]/open-in-editor-button', () => ({
  OpenInEditorButton: () => null,
}));
jest.mock('@/components/CopyableCommand', () => ({ CopyableCommand: () => null }));
jest.mock('next/navigation', () => ({
  usePathname: () => '/cloud/sessions',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@/components/ui/confirm', () => ({
  useConfirm:
    () =>
    async (..._args: unknown[]) =>
      true,
}));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/cloud-agent/store/db-session-atoms', () => ({
  extractRepoFromGitUrl: (...args: Parameters<typeof extractRepoFromGitUrl>) =>
    extractRepoFromGitUrl(...args),
}));

type LinkedomModule = {
  parseHTML: (html: string) => { window: Record<string, unknown>; document: Document };
};

function installDom() {
  const requireFromHere = createRequire(__filename);
  const requireFromNext = createRequire(requireFromHere.resolve('next/package.json'));
  const parsed = (requireFromNext('linkedom') as LinkedomModule).parseHTML(
    '<!doctype html><html><body><div id="root"></div></body></html>'
  );
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previous = new Map<string, unknown>();
  for (const name of [
    'React',
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    previous.set(name, globals[name]);
  }
  Object.assign(globals, {
    React,
    window: parsed.window,
    document: parsed.document,
    HTMLElement: (parsed.window as { HTMLElement: typeof HTMLElement }).HTMLElement,
    Element: (parsed.window as { Element: typeof Element }).Element,
    Node: (parsed.window as { Node: typeof Node }).Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = parsed.document.getElementById('root');
  if (!container) throw new Error('root missing');
  return {
    container: container as HTMLElement,
    cleanup: () => previous.forEach((value, name) => (globals[name] = value)),
  };
}

function makeApiSession(sessionId: string) {
  return {
    session_id: sessionId,
    title: `Session ${sessionId}`,
    git_url: null,
    created_at: '2026-08-26T12:00:00.000Z',
    updated_at: '2026-08-26T12:00:00.000Z',
    created_on_platform: 'cli',
    cloud_agent_session_id: null,
  };
}

let SessionsPageContent!: (props: Record<string, never>) => React.ReactElement;

beforeAll(async () => {
  ({ SessionsPageContent } = await import('./SessionsPageContent'));
});

describe('SessionsPageContent rows survive a failed refresh', () => {
  let root: Root | undefined;
  let domCleanup: (() => void) | undefined;
  let queryClient: QueryClient | undefined;
  let container: HTMLElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    queryClient?.clear();
    queryClient = undefined;
    domCleanup?.();
    domCleanup = undefined;
    mockCapturedSessions = [];
    mockListQueryKeys.length = 0;
    mockListFetcher.mockReset();
    mockSearchFetcher.mockReset();
  });

  // Same defaults as apps/web/src/components/Providers.tsx
  function mountPage() {
    const dom = installDom();
    domCleanup = dom.cleanup;
    container = dom.container;
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
    });
    queryClient = client;
    act(() => {
      root = createRoot(dom.container);
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(SessionsPageContent, {})
        )
      );
    });
    return client;
  }

  async function waitFor(
    condition: () => boolean,
    message: string
  ) {
    for (let i = 0; i < 200; i++) {
      if (condition()) return;
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }
    throw new Error(message);
  }

  function rowsRendered(sessionId: string): boolean {
    return mockCapturedSessions.length > 0 && mockCapturedSessions.every(s => Boolean(s.sessionId)) && mockCapturedSessions.some(s => s.sessionId === sessionId);
  }

  it('keeps the visible rows and does not show the empty state when a refresh fails', async () => {
    mockListFetcher.mockResolvedValueOnce({ cliSessions: [makeApiSession('ses_alive')] });
    const client = mountPage();

    await waitFor(() => rowsRendered('ses_alive'), 'initial rows did not render');
    expect(container?.textContent).not.toContain('No sessions yet.');
    expect(mockListFetcher).toHaveBeenCalledTimes(1);

    // The refresh now fails the way a transient network error does: every
    // attempt rejects (retry: 1, so two attempts per refresh).
    mockListFetcher.mockRejectedValue(new Error('network down'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['cliSessionsV2', 'list'] });
    });

    expect(mockListFetcher).toHaveBeenCalledTimes(3);
    const listState = client.getQueryState(mockListQueryKeys[0]);
    expect(listState?.error).toBeTruthy();

    expect(mockCapturedSessions).toHaveLength(1);
    expect(mockCapturedSessions[0]?.sessionId).toBe('ses_alive');
    expect(container?.textContent).not.toContain('No sessions yet.');
    expect(container?.textContent).not.toContain('Loading sessions...');
  });
});
