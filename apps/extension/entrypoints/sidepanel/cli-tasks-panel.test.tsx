// @vitest-environment jsdom

import { createElement } from 'react';
import { Provider, createStore } from 'jotai';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { browserTaskQueueAtom } from '@/src/shared/browser-task-queue';
import type {
  BrowserTaskQueueItem,
  BrowserTaskStatus,
  BrowserTaskTerminalStatus,
} from '@/src/shared/browser-task-queue';
import { CliTasksPanel } from './cli-tasks-panel';

const makeTask = (
  taskId: string,
  status: BrowserTaskStatus,
  terminalStatus: BrowserTaskTerminalStatus | null
): BrowserTaskQueueItem => ({
  boundTabId: null,
  goal: `Goal for ${taskId}`,
  invocationId: `invocation-${taskId}`,
  provider: 'chrome',
  status,
  summary: null,
  taskId,
  terminalStatus,
});

const renderPanel = (
  tasks: readonly BrowserTaskQueueItem[],
  onStop: (taskId: string) => void = vi.fn()
): ReturnType<typeof render> => {
  const store = createStore();
  store.set(browserTaskQueueAtom, tasks);
  return render(
    createElement(
      Provider,
      { store },
      createElement(CliTasksPanel, { onStop, owner: 'tester@example.com' })
    )
  );
};

describe('cli tasks panel', () => {
  it('counts only non-terminal tasks in the badge', () => {
    renderPanel([
      makeTask('task-1', 'queued', null),
      makeTask('task-2', 'running', null),
      makeTask('task-3', 'completed', 'completed'),
      makeTask('task-4', 'failed', 'failed'),
    ]);

    expect(screen.getByText('2 active')).toBeDefined();
  });

  it('shows Stop for a running task and Dismiss for a terminal task', () => {
    renderPanel([
      makeTask('task-1', 'running', null),
      makeTask('task-2', 'completed', 'completed'),
    ]);

    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
  });

  it('calls onStop with the task id when Stop is clicked', () => {
    const onStop = vi.fn();
    renderPanel([makeTask('task-1', 'running', null)], onStop);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(onStop).toHaveBeenCalledWith('task-1');
  });

  it('removes a dismissed terminal task and returns the empty state', () => {
    renderPanel([makeTask('task-1', 'completed', 'completed')]);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByText('No CLI tasks.')).toBeDefined();
    expect(screen.getByText('0 active')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});
