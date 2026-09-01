import { describe, expect, it } from 'vitest';
import { isBrowserTaskTerminal, removeBrowserTask } from './browser-task-queue';
import type { BrowserTaskQueueItem } from './browser-task-queue';

const makeItem = (
  taskId: string,
  terminalStatus: BrowserTaskQueueItem['terminalStatus']
): BrowserTaskQueueItem => ({
  boundTabId: null,
  goal: 'Summarize the open page.',
  invocationId: `00000000-0000-4000-8000-${taskId.padStart(12, '0')}`,
  provider: 'chrome',
  status: terminalStatus ?? 'queued',
  summary: null,
  taskId,
  terminalStatus,
});

describe('browser task terminal status', () => {
  it('is false for a queued task', () => {
    expect(isBrowserTaskTerminal(makeItem('task-1', null))).toBe(false);
  });

  it.each(['completed', 'failed', 'stopped'] as const)('is true for a %s task', terminalStatus => {
    expect(isBrowserTaskTerminal(makeItem('task-1', terminalStatus))).toBe(true);
  });
});

describe('browser task removal', () => {
  it('removes only the matching task', () => {
    const queue = [makeItem('task-1', 'completed'), makeItem('task-2', 'failed')];

    expect(removeBrowserTask(queue, 'task-1')).toStrictEqual([queue[1]]);
  });

  it('returns the queue unchanged for an unknown id', () => {
    const queue = [makeItem('task-1', 'completed')];

    expect(removeBrowserTask(queue, 'missing')).toBe(queue);
  });
});
