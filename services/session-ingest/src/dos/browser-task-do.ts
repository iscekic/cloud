import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import type { Env } from '../env';
import {
  browserTaskSchema,
  enqueueBrowserTaskInputSchema,
  type BrowserTask,
  type BrowserTerminalStatus,
} from '../browser-task-schemas';

const QUEUE_KEY = 'queue';

/** Namespaced task id: `<browserProfileId>:<uuid>`. Colon is a single path segment. */
export function makeBrowserTaskId(browserProfileId: string): string {
  return `${browserProfileId}:${crypto.randomUUID()}`;
}

/** Recover the owning profile from a namespaced task id, or `undefined`. */
export function browserProfileIdFromTaskId(taskId: string): string | undefined {
  const separator = taskId.lastIndexOf(':');
  if (separator <= 0 || separator === taskId.length - 1) return undefined;
  return taskId.slice(0, separator);
}

type ProgressInput = {
  taskId: string;
  status?: 'running' | 'progress';
  summary?: string | null;
  evidence?: unknown;
  boundTabId?: number | null;
};

type SettleInput = {
  taskId: string;
  terminalStatus: BrowserTerminalStatus;
  summary?: string | null;
  evidence?: unknown;
};

export type EnqueueResult = { task: BrowserTask; created: boolean };

/**
 * RPC surface used by routes. `DurableObjectStub<BrowserTaskDO>` types these
 * methods as `never` because `BrowserTask.evidence` is `unknown` (not provably
 * structured-cloneable), so this stub preserves the true return shapes.
 */
export type BrowserTaskStub = {
  enqueue(input: unknown): Promise<EnqueueResult>;
  list(): Promise<BrowserTask[]>;
  get(taskId: string): Promise<BrowserTask | null>;
  updateProgress(input: ProgressInput): Promise<BrowserTask | null>;
  settle(input: SettleInput): Promise<BrowserTask | null>;
};

/**
 * Durable Object keyed by `browserProfileId` that owns the per-profile FIFO
 * task queue and each task's state. `enqueue` dedupes on `invocationId`: a
 * repeated submission returns the existing task and never starts a second run.
 */
export class BrowserTaskDO extends DurableObject<Env> {
  async enqueue(input: unknown): Promise<EnqueueResult> {
    const parsed = enqueueBrowserTaskInputSchema.parse(input);
    const tasks = await this.loadTasks();

    const existing = tasks.find(task => task.invocationId === parsed.invocationId);
    if (existing) {
      return { task: existing, created: false };
    }

    const now = new Date().toISOString();
    const task: BrowserTask = {
      taskId: makeBrowserTaskId(parsed.browserProfileId),
      ownerKiloUserId: parsed.ownerKiloUserId,
      browserProfileId: parsed.browserProfileId,
      provider: parsed.provider,
      goal: parsed.goal,
      invocationId: parsed.invocationId,
      status: 'queued',
      summary: null,
      evidence: null,
      terminalStatus: null,
      boundTabId: null,
      createdAt: now,
      updatedAt: now,
    };

    tasks.push(task);
    await this.ctx.storage.put(QUEUE_KEY, tasks);
    return { task, created: true };
  }

  async list(): Promise<BrowserTask[]> {
    return this.loadTasks();
  }

  async get(taskId: string): Promise<BrowserTask | null> {
    const tasks = await this.loadTasks();
    return tasks.find(task => task.taskId === taskId) ?? null;
  }

  async updateProgress(input: ProgressInput): Promise<BrowserTask | null> {
    const tasks = await this.loadTasks();
    const index = tasks.findIndex(task => task.taskId === input.taskId);
    if (index < 0) return null;

    const current = tasks[index];
    if (current.terminalStatus) return current;

    const updated: BrowserTask = {
      ...current,
      status: input.status ?? 'progress',
      summary: input.summary !== undefined ? input.summary : current.summary,
      evidence: input.evidence !== undefined ? input.evidence : current.evidence,
      boundTabId: input.boundTabId !== undefined ? input.boundTabId : current.boundTabId,
      updatedAt: new Date().toISOString(),
    };
    tasks[index] = updated;
    await this.ctx.storage.put(QUEUE_KEY, tasks);
    return updated;
  }

  async settle(input: SettleInput): Promise<BrowserTask | null> {
    const tasks = await this.loadTasks();
    const index = tasks.findIndex(task => task.taskId === input.taskId);
    if (index < 0) return null;

    const current = tasks[index];
    if (current.terminalStatus) return current;

    const updated: BrowserTask = {
      ...current,
      status: input.terminalStatus,
      terminalStatus: input.terminalStatus,
      summary: input.summary !== undefined ? input.summary : current.summary,
      evidence: input.evidence !== undefined ? input.evidence : current.evidence,
      updatedAt: new Date().toISOString(),
    };
    tasks[index] = updated;
    await this.ctx.storage.put(QUEUE_KEY, tasks);
    return updated;
  }

  private async loadTasks(): Promise<BrowserTask[]> {
    const stored = await this.ctx.storage.get<BrowserTask[]>(QUEUE_KEY);
    const parsed = z.array(browserTaskSchema).safeParse(stored);
    return parsed.success ? parsed.data : [];
  }
}

export function getBrowserTaskDO(env: Env, params: { browserProfileId: string }): BrowserTaskStub {
  const id = env.BROWSER_TASK_DO.idFromName(params.browserProfileId);
  // The generated stub types `BrowserTask` as non-serializable (evidence is
  // `unknown`), so cast back to the explicit stub surface above.
  return env.BROWSER_TASK_DO.get(id) as unknown as BrowserTaskStub;
}
