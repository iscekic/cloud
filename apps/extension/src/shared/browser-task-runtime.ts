/* eslint-disable max-lines -- factory wires dispatch, run, settle, and lifecycle; splitting would scatter one task's runtime across files */
import type { JotaiStore, UserWebSystemEvent } from '@kilocode/cloud-agent-sdk';
import { z } from 'zod';
import type { FetchLike } from './auth';
import { browserTaskQueueAtom, enqueueBrowserTask, updateBrowserTask } from './browser-task-queue';
import type { BrowserTaskQueueItem, BrowserTaskTerminalStatus } from './browser-task-queue';

const BROWSER_TASK_EVENT = 'browser_task';

/**
 * A browser task is a long, accepted job: the CLI does not hold its request
 * open. This bound only guards against a turn that never ends (a runaway tool
 * loop the round-limit missed); a healthy long turn runs to completion inside
 * it. Injectable for tests.
 */
export const BROWSER_TASK_TIMEOUT_MS = 30 * 60_000;

/** Relay `browser_task` system event payload from session-ingest. */
const browserTaskEventDataSchema = z.object({
  goal: z.string().min(1),
  invocationId: z.uuid(),
  provider: z.string().min(1),
  taskId: z.string().min(1),
});

/** Update POSTed to `POST /api/browser-task/:taskId`. Mirrors the s1 schema. */
export interface BrowserTaskUpdatePayload {
  readonly status?: 'running' | 'progress';
  readonly summary?: string | null;
  readonly evidence?: unknown;
  readonly terminalStatus?: BrowserTaskTerminalStatus;
  readonly boundTabId?: number | null;
}

export interface BrowserTaskTurnResult {
  readonly summary: string;
  readonly evidence?: unknown;
}

export interface BrowserTaskRunInput {
  readonly goal: string;
  readonly selectedTabId: number;
  readonly signal: AbortSignal;
  /** Fires with each streamed assistant summary while the turn runs. */
  readonly onProgress?: (summary: string) => void;
}

/** The one surface the runtime needs from the cloud connection. */
export interface BrowserTaskSystemEventSource {
  onSystemEvent(listener: (event: UserWebSystemEvent) => void): () => void;
}

export interface BrowserTaskRuntimeOptions {
  readonly userWebConnection: BrowserTaskSystemEventSource;
  readonly store: JotaiStore;
  /** Approved tab captured at dispatch. A later active-tab change must not redirect the run. */
  readonly getSelectedTabId: () => number | undefined;
  readonly runTurn: (input: BrowserTaskRunInput) => Promise<BrowserTaskTurnResult>;
  readonly postUpdate: (taskId: string, update: BrowserTaskUpdatePayload) => Promise<void>;
  readonly timeoutMs?: number;
}

export interface BrowserTaskRuntime {
  /** Subscribe to `browser_task` events. Returns the unsubscribe function. */
  readonly start: () => () => void;
  /** Abort the running turn for one task; it settles `stopped`. */
  readonly stop: (taskId: string) => void;
  /** Abort every running turn; each settles `stopped`. Panel close/shutdown. */
  readonly shutdown: () => void;
  /** Abort any running task whose bound tab left the approved set; it settles `failed`. */
  readonly onTabsChanged: (approvedTabIds: ReadonlySet<number>) => void;
}

interface RunningTask {
  readonly abort: AbortController;
  /** Why the signal was aborted; drives the honest terminal status. */
  kind: 'stopped' | 'failed' | null;
  readonly selectedTabId: number;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Browser task failed.';

/**
 * Assemble the extension-side browser task runtime. It subscribes to the
 * `browser_task` system event on the existing cloud connection, dedupes on
 * `invocationId`, binds the task to one approved tab captured at dispatch,
 * runs the existing agent turn machinery through the injected `runTurn`, and
 * posts `running`/`progress` then an honest terminal status back to the cloud.
 */
export const createBrowserTaskRuntime = ({
  getSelectedTabId,
  postUpdate,
  runTurn,
  store,
  timeoutMs = BROWSER_TASK_TIMEOUT_MS,
  userWebConnection,
}: Readonly<BrowserTaskRuntimeOptions>): BrowserTaskRuntime => {
  const runningTasks = new Map<string, RunningTask>();
  let unsubscribe: (() => void) | null = null;

  const patchQueue = (taskId: string, patch: Partial<BrowserTaskQueueItem>): void => {
    store.set(
      browserTaskQueueAtom,
      updateBrowserTask(store.get(browserTaskQueueAtom), taskId, patch)
    );
  };

  /* Posting is best-effort: a failed update must not crash the runtime or lose
     the local queue state; the CLI's poll path recovers the honest status on
     its next read. */
  const postBestEffort = async (
    taskId: string,
    update: BrowserTaskUpdatePayload
  ): Promise<void> => {
    try {
      await postUpdate(taskId, update);
    } catch (error) {
      console.warn('Failed to post browser task update:', errorMessage(error));
    }
  };

  const settle = (input: {
    readonly evidence?: unknown;
    readonly summary: string;
    readonly taskId: string;
    readonly terminalStatus: BrowserTaskTerminalStatus;
  }): void => {
    patchQueue(input.taskId, {
      status: input.terminalStatus,
      summary: input.summary,
      terminalStatus: input.terminalStatus,
    });
    void postBestEffort(input.taskId, {
      summary: input.summary,
      terminalStatus: input.terminalStatus,
      ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    });
  };

  const runTask = async (task: BrowserTaskQueueItem, selectedTabId: number): Promise<void> => {
    const abort = new AbortController();
    const running: RunningTask = { abort, kind: null, selectedTabId };
    runningTasks.set(task.taskId, running);
    const timeout = setTimeout(() => {
      running.kind = 'failed';
      abort.abort();
    }, timeoutMs);

    patchQueue(task.taskId, { boundTabId: selectedTabId, status: 'running' });
    void postBestEffort(task.taskId, { boundTabId: selectedTabId, status: 'running' });

    try {
      const result = await runTurn({
        goal: task.goal,
        onProgress: summary => {
          if (summary === '') {
            return;
          }
          patchQueue(task.taskId, { status: 'progress', summary });
          void postBestEffort(task.taskId, { status: 'progress', summary });
        },
        selectedTabId,
        signal: abort.signal,
      });

      if (abort.signal.aborted) {
        settle({
          summary: running.kind === 'stopped' ? 'Stopped.' : '',
          taskId: task.taskId,
          terminalStatus: running.kind ?? 'failed',
        });
        return;
      }

      settle({
        evidence: result.evidence,
        summary: result.summary,
        taskId: task.taskId,
        terminalStatus: 'completed',
      });
    } catch (error) {
      if (abort.signal.aborted) {
        /* The signal was aborted by timeout, Stop, panel close, or a lost tab. */
        settle({
          summary: running.kind === 'stopped' ? 'Stopped.' : '',
          taskId: task.taskId,
          terminalStatus: running.kind ?? 'failed',
        });
        return;
      }
      /* Provider loss or any non-abort turn failure. */
      settle({
        summary: errorMessage(error),
        taskId: task.taskId,
        terminalStatus: 'failed',
      });
    } finally {
      clearTimeout(timeout);
      runningTasks.delete(task.taskId);
    }
  };

  const dispatch = async (data: z.infer<typeof browserTaskEventDataSchema>): Promise<void> => {
    const item: BrowserTaskQueueItem = {
      boundTabId: null,
      goal: data.goal,
      invocationId: data.invocationId,
      provider: data.provider,
      status: 'queued',
      summary: null,
      taskId: data.taskId,
      terminalStatus: null,
    };

    const { queue, added } = enqueueBrowserTask(store.get(browserTaskQueueAtom), item);
    if (!added) {
      /* Repeated delivery is a no-op; a duplicate can never start a second run. */
      return;
    }
    store.set(browserTaskQueueAtom, queue);

    const selectedTabId = getSelectedTabId();
    if (selectedTabId === undefined) {
      settle({
        summary: 'No approved tab is available for this browser task.',
        taskId: item.taskId,
        terminalStatus: 'failed',
      });
      return;
    }

    await runTask(item, selectedTabId);
  };

  const handleSystemEvent = (event: UserWebSystemEvent): void => {
    if (event.event !== BROWSER_TASK_EVENT) {
      return;
    }
    const parsed = browserTaskEventDataSchema.safeParse(event.data);
    if (!parsed.success) {
      return;
    }
    void dispatch(parsed.data);
  };

  return {
    onTabsChanged(approvedTabIds) {
      for (const running of runningTasks.values()) {
        if (!approvedTabIds.has(running.selectedTabId)) {
          running.kind = 'failed';
          running.abort.abort();
        }
      }
    },
    shutdown() {
      for (const running of runningTasks.values()) {
        running.kind = 'stopped';
        running.abort.abort();
      }
    },
    start() {
      if (unsubscribe !== null) {
        return unsubscribe;
      }
      unsubscribe = userWebConnection.onSystemEvent(handleSystemEvent);
      return unsubscribe;
    },
    stop(taskId) {
      const running = runningTasks.get(taskId);
      if (running === undefined) {
        return;
      }
      running.kind = 'stopped';
      running.abort.abort();
    },
  };
};

/** Local storage key for the extension's stable browser profile id. */
export const BROWSER_PROFILE_ID_STORAGE_KEY = 'local:kiloBrowserProfileId';

/**
 * Stable, human-readable provider name the extension advertises so a CLI
 * caller can name one enabled, connected provider. Derived from the browser
 * the extension is built for (e.g. `chrome`, `firefox`, `safari`). Falls back
 * to `browser` when the build does not expose a browser name (tests).
 */
export const getBrowserProviderName = (): string => {
  const browserName: string | undefined = import.meta.env.BROWSER;
  return browserName && browserName.trim() !== '' ? browserName.trim().toLowerCase() : 'browser';
};

const browserProfileIdSchema = z.string().min(1).max(128);

type MaybePromise<Value> = Promise<Value> | Value;

export interface BrowserProfileIdStorageArea {
  getItem(key: typeof BROWSER_PROFILE_ID_STORAGE_KEY): MaybePromise<unknown>;
  setItem(key: typeof BROWSER_PROFILE_ID_STORAGE_KEY, value: string): MaybePromise<void>;
}

/**
 * Load the extension's stable browser profile id, minting and persisting one
 * on first use. The relay targets web sockets by this id, so it must survive
 * panel reloads and sign-ins on the same profile.
 */
export const getOrCreateBrowserProfileId = async (
  storageArea: BrowserProfileIdStorageArea
): Promise<string> => {
  const existing = browserProfileIdSchema.safeParse(
    await storageArea.getItem(BROWSER_PROFILE_ID_STORAGE_KEY)
  );
  if (existing.success) {
    return existing.data;
  }
  const profileId = crypto.randomUUID();
  await storageArea.setItem(BROWSER_PROFILE_ID_STORAGE_KEY, profileId);
  return profileId;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Authenticated HTTP poster for `POST /api/browser-task/:taskId`. Maps the
 * session-ingest WebSocket URL to its HTTP origin and reuses the Bearer token.
 */
export const createBrowserTaskPoster =
  ({
    fetch,
    getToken,
    sessionIngestWebSocketUrl,
  }: {
    readonly fetch: FetchLike;
    readonly getToken: () => string | undefined;
    readonly sessionIngestWebSocketUrl: string;
  }): ((taskId: string, update: BrowserTaskUpdatePayload) => Promise<void>) =>
  async (taskId, update) => {
    const token = getToken();
    const sessionIngestHttpBaseUrl = sessionIngestWebSocketUrl.replace(/^ws(s?):/, 'http$1:');
    const response = await fetch(
      `${trimTrailingSlash(sessionIngestHttpBaseUrl)}/api/browser-task/${encodeURIComponent(taskId)}`,
      {
        body: JSON.stringify(update),
        headers: {
          'Content-Type': 'application/json',
          ...(token === undefined || token === '' ? {} : { Authorization: `Bearer ${token}` }),
        },
        method: 'POST',
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to update browser task: ${response.status}`);
    }
  };
