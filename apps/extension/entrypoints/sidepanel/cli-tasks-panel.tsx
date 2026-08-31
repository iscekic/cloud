import { useAtomValue } from 'jotai';
import { Square } from 'lucide-react';
import type { JSX } from 'react';
import { browserTaskQueueAtom } from '@/src/shared/browser-task-queue';

export const CliTasksPanel = ({
  onStop,
  owner,
}: {
  onStop: (taskId: string) => void;
  owner: string;
}): JSX.Element => {
  const tasks = useAtomValue(browserTaskQueueAtom);

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
          {tasks.length} queued
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
                    className="type-label flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-2 text-foreground-on-secondary transition hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-ring ring-offset-2 ring-offset-surface-background"
                    onClick={() => {
                      onStop(task.taskId);
                    }}
                    type="button"
                  >
                    <Square aria-hidden="true" className="size-3" />
                    Stop
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
