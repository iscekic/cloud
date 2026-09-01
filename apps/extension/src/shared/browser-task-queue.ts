import { atom } from 'jotai';

/**
 * Mirrors the session-ingest `browserTaskStatusSchema`. `progress`/`running`
 * are live states; `completed`/`failed`/`stopped` are the honest terminal
 * states a browser task can settle with.
 */
export type BrowserTaskStatus =
  | 'queued'
  | 'running'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'stopped';

/** Only these three states may ever be a terminal status. */
export type BrowserTaskTerminalStatus = 'completed' | 'failed' | 'stopped';

/**
 * One received browser task held in the extension's in-memory queue. The
 * extension advertises a single browser profile, so the queue is implicitly
 * per-profile: every item here belongs to this extension instance's profile.
 */
export interface BrowserTaskQueueItem {
  readonly taskId: string;
  readonly provider: string;
  readonly goal: string;
  readonly invocationId: string;
  /**
   * Owning CLI session id carried from the authenticated submit. Optional so a
   * relay that predates the field still parses; the panel omits it when absent.
   */
  readonly sessionId?: string;
  readonly status: BrowserTaskStatus;
  readonly terminalStatus: BrowserTaskTerminalStatus | null;
  readonly summary: string | null;
  readonly boundTabId: number | null;
}

/**
 * Jotai-backed queue of incoming browser tasks. s4 renders this atom directly.
 * Pure helpers below mutate it through the store; nothing writes it elsewhere.
 */
export const browserTaskQueueAtom = atom<readonly BrowserTaskQueueItem[]>([]);

export interface EnqueueBrowserTaskResult {
  readonly queue: readonly BrowserTaskQueueItem[];
  readonly added: boolean;
}

/**
 * Append a received task unless its `invocationId` is already present. A
 * repeated delivery returns the same queue unchanged (`added: false`) so a
 * duplicate relay can never start a second run.
 */
export const enqueueBrowserTask = (
  queue: readonly BrowserTaskQueueItem[],
  task: BrowserTaskQueueItem
): EnqueueBrowserTaskResult => {
  if (queue.some(item => item.invocationId === task.invocationId)) {
    return { added: false, queue };
  }
  return { added: true, queue: [...queue, task] };
};

/** Immutably patch one queued task by id. Unknown ids return the queue unchanged. */
export const updateBrowserTask = (
  queue: readonly BrowserTaskQueueItem[],
  taskId: string,
  patch: Partial<BrowserTaskQueueItem>
): readonly BrowserTaskQueueItem[] =>
  queue.map(item => (item.taskId === taskId ? { ...item, ...patch } : item));

/** True once a task has settled into a terminal state. */
export const isBrowserTaskTerminal = (task: BrowserTaskQueueItem): boolean =>
  task.terminalStatus !== null;

/** Immutably remove one queued task by id. Unknown ids return the queue unchanged. */
export const removeBrowserTask = (
  queue: readonly BrowserTaskQueueItem[],
  taskId: string
): readonly BrowserTaskQueueItem[] => {
  const next = queue.filter(item => item.taskId !== taskId);
  return next.length === queue.length ? queue : next;
};
