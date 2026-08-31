/* eslint-disable max-lines, promise/prefer-await-to-then, vitest/prefer-called-once, vitest/prefer-describe-function-title -- nine runtime cases live in one suite; fixtures return raw promises; prefer-called-once conflicts with prefer-called-times; jest/valid-title requires string titles */
import type { UserWebSystemEvent } from '@kilocode/cloud-agent-sdk';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { browserTaskQueueAtom } from './browser-task-queue';
import { createBrowserTaskPoster, createBrowserTaskRuntime } from './browser-task-runtime';
import type {
  BrowserTaskRunInput,
  BrowserTaskSystemEventSource,
  BrowserTaskTurnResult,
} from './browser-task-runtime';

const INVOCATION_ONE = '00000000-0000-4000-8000-000000000001';
const TASK_ONE = 'profile:task-1';

type RunTurn = (input: BrowserTaskRunInput) => Promise<BrowserTaskTurnResult>;

const makeEvent = (
  overrides: Partial<{ goal: string; invocationId: string; provider: string; taskId: string }> = {}
): UserWebSystemEvent => ({
  data: {
    goal: 'Summarize the open page.',
    invocationId: INVOCATION_ONE,
    provider: 'chrome',
    taskId: TASK_ONE,
    ...overrides,
  },
  event: 'browser_task',
});

const createFakeConnection = (): {
  readonly connection: BrowserTaskSystemEventSource;
  readonly emit: (event: UserWebSystemEvent) => void;
} => {
  let listener: ((event: UserWebSystemEvent) => void) | null = null;
  const connection: BrowserTaskSystemEventSource = {
    onSystemEvent: (next: (event: UserWebSystemEvent) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };

  return {
    connection,
    emit: event => listener?.(event),
  };
};

/** A turn that never resolves until its signal aborts, then rejects. */
const hangingTurn = (): ReturnType<typeof vi.fn<RunTurn>> =>
  vi.fn<RunTurn>(
    ({ signal }: BrowserTaskRunInput) =>
      // eslint-disable-next-line promise/avoid-new -- A promise that settles only on abort has no promise-returning primitive to defer to.
      new Promise<BrowserTaskTurnResult>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true }
        );
      })
  );

const completedTurn = (): RunTurn => () => Promise.resolve({ summary: 'done' });

describe('createBrowserTaskRuntime', () => {
  it('dedupes a repeated invocationId so the run never starts twice', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const runTurn = vi.fn(completedTurn());
    const postUpdate = vi.fn(() => Promise.resolve());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    const event = makeEvent();
    emit(event);
    emit(event);

    await vi.waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(1);
    });
    expect(store.get(browserTaskQueueAtom)).toHaveLength(1);
    expect(postUpdate).toHaveBeenCalledWith(
      TASK_ONE,
      expect.objectContaining({ terminalStatus: 'completed' })
    );
  });

  it('binds the task to the tab captured at dispatch, not a later active tab', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    let activeTabId = 5;
    const runTurn = vi.fn(completedTurn());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => activeTabId,
      postUpdate: vi.fn(() => Promise.resolve()),
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());
    await vi.waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    // The active tab changes while the task is already bound.
    activeTabId = 9;

    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({ goal: 'Summarize the open page.', selectedTabId: 5 })
    );
    expect(runTurn).not.toHaveBeenCalledWith(expect.objectContaining({ selectedTabId: 9 }));
    expect(store.get(browserTaskQueueAtom)[0]?.boundTabId).toBe(5);
  });

  it('settles failed on provider loss when the turn rejects', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn: vi.fn(() => Promise.reject(new Error('network down'))),
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'failed' })
      );
    });
    expect(store.get(browserTaskQueueAtom)[0]?.terminalStatus).toBe('failed');
    expect(store.get(browserTaskQueueAtom)[0]?.summary).toBe('network down');
  });

  it('settles failed when the turn times out', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn: hangingTurn(),
      store,
      timeoutMs: 5,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'failed' })
      );
    });
    expect(store.get(browserTaskQueueAtom)[0]?.terminalStatus).toBe('failed');
  });

  it('settles failed when the bound tab is lost', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runTurn = hangingTurn();
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());
    await vi.waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    runtime.onTabsChanged(new Set([7]));

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'failed' })
      );
    });
    expect(store.get(browserTaskQueueAtom)[0]?.terminalStatus).toBe('failed');
  });

  it('stop aborts the turn and settles stopped', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runTurn = hangingTurn();
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());
    await vi.waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    runtime.stop(TASK_ONE);

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'stopped' })
      );
    });
    expect(store.get(browserTaskQueueAtom)[0]?.terminalStatus).toBe('stopped');
  });

  it('ignores a non-browser_task system event', () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const runTurn = vi.fn(completedTurn());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate: vi.fn(() => Promise.resolve()),
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit({ data: { sessions: [] }, event: 'sessions.list' });

    expect(runTurn).not.toHaveBeenCalled();
    expect(store.get(browserTaskQueueAtom)).toHaveLength(0);
  });

  it('posts running then completed for a successful turn', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runtime = createBrowserTaskRuntime({
      getSelectedTabId: () => 5,
      postUpdate,
      runTurn: vi.fn(() =>
        Promise.resolve({ evidence: { screenshot: true }, summary: 'All done.' })
      ),
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'completed' })
      );
    });
    expect(postUpdate).toHaveBeenCalledWith(
      TASK_ONE,
      expect.objectContaining({ boundTabId: 5, status: 'running' })
    );
    expect(postUpdate).toHaveBeenCalledWith(
      TASK_ONE,
      expect.objectContaining({ evidence: { screenshot: true }, summary: 'All done.' })
    );
  });

  it('settles failed when no approved tab is available at dispatch', async () => {
    const { connection, emit } = createFakeConnection();
    const store = createStore();
    const postUpdate = vi.fn(() => Promise.resolve());
    const runTurn = vi.fn(completedTurn());
    const runtime = createBrowserTaskRuntime({
      // eslint-disable-next-line unicorn/no-useless-undefined -- A missing approved tab is the undefined return value this getter advertises.
      getSelectedTabId: () => undefined,
      postUpdate,
      runTurn,
      store,
      userWebConnection: connection,
    });
    runtime.start();

    emit(makeEvent());

    await vi.waitFor(() => {
      expect(postUpdate).toHaveBeenCalledWith(
        TASK_ONE,
        expect.objectContaining({ terminalStatus: 'failed' })
      );
    });
    expect(runTurn).not.toHaveBeenCalled();
    expect(store.get(browserTaskQueueAtom)[0]?.terminalStatus).toBe('failed');
  });
});

describe('createBrowserTaskPoster', () => {
  it.each([
    {
      expectedBaseUrl: 'https://ingest.kilosessions.ai',
      sessionIngestWebSocketUrl: 'wss://ingest.kilosessions.ai/',
    },
    {
      expectedBaseUrl: 'http://localhost:8800',
      sessionIngestWebSocketUrl: 'ws://localhost:8800/',
    },
  ])(
    'maps $sessionIngestWebSocketUrl to $expectedBaseUrl',
    async ({ expectedBaseUrl, sessionIngestWebSocketUrl }) => {
      const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
      const postUpdate = createBrowserTaskPoster({
        fetch,
        getToken: () => 'token',
        sessionIngestWebSocketUrl,
      });

      await postUpdate('profile:task/1', { status: 'running' });

      expect(fetch).toHaveBeenCalledWith(
        `${expectedBaseUrl}/api/browser-task/profile%3Atask%2F1`,
        expect.objectContaining({ method: 'POST' })
      );
    }
  );
});
