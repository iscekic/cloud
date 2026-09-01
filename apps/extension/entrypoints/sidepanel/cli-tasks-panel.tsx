import { useAtomValue, useSetAtom } from 'jotai';
import { Square, X } from 'lucide-react';
import type { JSX } from 'react';
import {
  browserTaskQueueAtom,
  isBrowserTaskTerminal,
  removeBrowserTask,
} from '@/src/shared/browser-task-queue';

const taskActionButtonClass =
  'type-label flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-2 text-foreground-on-secondary transition hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-ring ring-offset-2 ring-offset-surface-background';

export const CliTasksPanel = ({
  onStop,
  owner,
}: {
  onStop: (taskId: string) => void;
  owner: string;
}): JSX.Element => {
  const tasks = useAtomValue(browserTaskQueueAtom);
  const setTasks = useSetAtom(browserTaskQueueAtom);
  const activeCount = tasks.filter(task => !isBrowserTaskTerminal(task)).length;

  return (
    <section aria-label="CLI tasks" className="shrink-0 border-b border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <h2 className="type-label font-medium text-foreground">CLI tasks</h2>
          <p className="type-label truncate text-foreground-muted" title={owner}>
            Owner: {owner}
          </p>
        </div>
        <span className="type-eyebrow rounded-full bg-surface-selected px-2 py-1 text-foreground-muted">
          {activeCount} active
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="type-label border-t border-border px-4 py-2 text-foreground-muted">
          No CLI tasks.
        </p>
      ) : (
        <ul className="agent-conversation-scrollbar max-h-40 overflow-y-auto border-t border-border">
          {tasks.map(task => {
            const status = task.terminalStatus ?? task.status;
            const isTerminal = task.terminalStatus !== null;
            const canStop = task.status === 'running' || task.status === 'progress';

            return (
              <li
                className="flex min-w-0 items-start gap-2 border-b border-border px-4 py-2 last:border-b-0"
                key={task.taskId}
              >
                <div className="min-w-0 flex-1">
                  <p className="type-body truncate text-foreground" title={task.goal}>
                    {task.goal}
                  </p>
                  <p className="type-label mt-0.5 truncate text-foreground-muted">
                    {task.provider} · <span className="capitalize">{status}</span>
                  </p>
                </div>
                {canStop ? (
                  <button
                    className={taskActionButtonClass}
                    onClick={() => {
                      onStop(task.taskId);
                    }}
                    type="button"
                  >
                    <Square aria-hidden="true" className="size-3" />
                    Stop
                  </button>
                ) : null}
                {isTerminal ? (
                  <button
                    className={taskActionButtonClass}
                    onClick={() => {
                      setTasks(queue => removeBrowserTask(queue, task.taskId));
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3" />
                    Dismiss
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
