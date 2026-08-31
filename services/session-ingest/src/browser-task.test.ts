import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class DurableObject {
    ctx: unknown;
    env: unknown;
    constructor(state: unknown, env: unknown) {
      this.ctx = state;
      this.env = env;
    }
  },
}));

vi.mock('@kilocode/db/client', () => ({
  getWorkerDb: vi.fn(),
}));

vi.mock('./dos/SessionIngestDO', () => ({
  getSessionIngestDO: vi.fn(),
}));

vi.mock('./dos/SessionAccessCacheDO', () => ({
  getSessionAccessCacheDO: vi.fn(),
}));

vi.mock('./dos/UserConnectionDO', () => ({
  getUserConnectionDO: vi.fn(),
}));

import { BrowserTaskDO } from './dos/browser-task-do';
import { getUserConnectionDO } from './dos/UserConnectionDO';
import { api } from './routes/api';
import { submitBrowserTaskSchema } from './browser-task-schemas';

const OWNER = 'usr_test';
const OTHER_OWNER = 'usr_attacker';
const PROFILE_A = 'profile-a';
const PROFILE_B = 'profile-b';

function makeStorage() {
  const store = new Map<string, unknown>();
  const storage = {
    put: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    get: async <T>(key: string): Promise<T | undefined> => store.get(key) as T | undefined,
  };
  return { store, storage };
}

function makeDO() {
  const { store, storage } = makeStorage();
  const instance = new BrowserTaskDO({ storage } as never, {} as never);
  return { instance, store };
}

function enqueueInput(
  overrides: {
    ownerKiloUserId?: string;
    browserProfileId?: string;
    provider?: string;
    goal?: string;
    invocationId?: string;
  } = {}
) {
  return {
    ownerKiloUserId: OWNER,
    browserProfileId: PROFILE_A,
    provider: 'chrome',
    goal: 'open the inbox',
    invocationId: crypto.randomUUID(),
    ...overrides,
  };
}

describe('BrowserTaskDO', () => {
  it('dedupes enqueue by invocationId and never starts a second run', async () => {
    const { instance } = makeDO();
    const input = enqueueInput();

    const first = await instance.enqueue(input);
    const second = await instance.enqueue(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.task.taskId).toBe(first.task.taskId);
    expect(await instance.list()).toHaveLength(1);
  });

  it('isolates the FIFO queue per browser profile', async () => {
    const a = makeDO().instance;
    const b = makeDO().instance;

    await a.enqueue(enqueueInput({ browserProfileId: PROFILE_A, goal: 'task-a' }));
    await b.enqueue(enqueueInput({ browserProfileId: PROFILE_B, goal: 'task-b' }));

    const listA = await a.list();
    const listB = await b.list();

    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0].browserProfileId).toBe(PROFILE_A);
    expect(listB[0].browserProfileId).toBe(PROFILE_B);
    expect(listA[0].goal).toBe('task-a');
    expect(listB[0].goal).toBe('task-b');
  });

  it('settles with an honest terminalStatus and keeps the first settlement', async () => {
    const { instance } = makeDO();
    const { task } = await instance.enqueue(enqueueInput());

    const completed = await instance.settle({
      taskId: task.taskId,
      terminalStatus: 'completed',
      summary: 'done',
    });
    const replay = await instance.settle({
      taskId: task.taskId,
      terminalStatus: 'failed',
      summary: 'nope',
    });

    expect(completed?.status).toBe('completed');
    expect(completed?.terminalStatus).toBe('completed');
    expect(completed?.summary).toBe('done');
    expect(replay?.terminalStatus).toBe('completed');
    expect(replay?.summary).toBe('done');
  });
});

describe('POST /browser-task owner-from-auth', () => {
  const invocationId = '11111111-1111-4111-8111-111111111111';

  function makeApp() {
    const app = new Hono<{
      Bindings: { BROWSER_TASK_DO: { idFromName: (name: string) => string; get: () => BrowserTaskDO } };
      Variables: { user_id: string };
    }>();
    app.use('*', async (c, next) => {
      c.set('user_id', OWNER);
      await next();
    });
    app.route('/', api);
    return app;
  }

  beforeEach(() => {
    vi.mocked(getUserConnectionDO).mockReset();
  });

  it('takes the owner from user_id and ignores owner fields in the body', async () => {
    const { instance } = makeDO();
    vi.mocked(getUserConnectionDO).mockReturnValue({
      hasConnectedBrowserProfile: vi.fn(async () => true),
      relayBrowserTask: vi.fn(async () => ({ delivered: 1 })),
    } as never);

    const parsed = submitBrowserTaskSchema.parse({
      browserProfileId: PROFILE_A,
      provider: 'chrome',
      goal: 'open the inbox',
      invocationId,
      owner: OTHER_OWNER,
      ownerKiloUserId: OTHER_OWNER,
    });
    expect(parsed).not.toHaveProperty('owner');
    expect(parsed).not.toHaveProperty('ownerKiloUserId');

    const res = await makeApp().fetch(
      new Request('http://local/browser-task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          browserProfileId: PROFILE_A,
          provider: 'chrome',
          goal: 'open the inbox',
          invocationId,
          owner: OTHER_OWNER,
          ownerKiloUserId: OTHER_OWNER,
        }),
      }),
      {
        BROWSER_TASK_DO: {
          idFromName: (name: string) => name,
          get: () => instance,
        },
      }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { taskId: string };
    const stored = await instance.get(body.taskId);
    expect(stored?.ownerKiloUserId).toBe(OWNER);
    expect(stored?.ownerKiloUserId).not.toBe(OTHER_OWNER);
  });
});
