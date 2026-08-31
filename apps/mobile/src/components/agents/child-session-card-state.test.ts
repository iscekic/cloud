import {
  type KiloSessionId,
  type StoredMessage,
  type ToolPart,
} from '@kilocode/cloud-agent-sdk';
import { describe, expect, it } from 'vitest';

import {
  getChildSessionCardState,
  getChildSessionStreaming,
  getTaskToolSessionId,
} from './child-session-card-state';

const subagentSessionId = 'ses-child' as KiloSessionId;

function makeToolPart(tool: string, state: ToolPart['state']): ToolPart {
  return {
    id: 'p1',
    sessionID: 'ses-1',
    messageID: 'msg-1',
    type: 'tool',
    tool,
    callID: 'call-1',
    state,
  };
}

function makeTaskPart(
  status: 'pending' | 'running' | 'completed' | 'error',
  input: Record<string, unknown> = {}
): ToolPart {
  if (status === 'pending') {
    return makeToolPart('task', { status: 'pending', input, raw: '' });
  }
  if (status === 'running') {
    return makeToolPart('task', {
      status: 'running',
      input,
      time: { start: 1 },
      metadata: { sessionId: subagentSessionId },
    });
  }
  if (status === 'completed') {
    return makeToolPart('task', {
      status: 'completed',
      input,
      output: 'done',
      title: 'Task',
      metadata: { sessionId: subagentSessionId },
      time: { start: 1, end: 2 },
    });
  }
  return makeToolPart('task', {
    status: 'error',
    input,
    error: 'failed',
    metadata: { sessionId: subagentSessionId },
    time: { start: 1, end: 2 },
  });
}

function makeAssistantMessage(parts: ToolPart[], id = 'msg-1'): StoredMessage {
  return {
    info: {
      id,
      sessionID: 'ses-1',
      role: 'assistant',
      time: { created: 1 },
      parentID: 'msg-0',
      modelID: 'claude',
      providerID: 'anthropic',
      mode: 'code',
      agent: 'build',
      path: { cwd: '/', root: '/' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts,
  };
}

describe('getChildSessionCardState', () => {
  it('falls back to Subagent / Task / pending for a pending task with empty input', () => {
    const part = makeTaskPart('pending');
    expect(getChildSessionCardState(part)).toEqual({
      agentName: 'Subagent',
      taskName: 'Task',
      status: 'pending',
    });
  });

  it('derives agentName and taskName from task metadata only', () => {
    const part = makeTaskPart('pending', { subagent_type: 'Coder', description: 'Refactor auth' });
    expect(getChildSessionCardState(part)).toEqual({
      agentName: 'Coder',
      taskName: 'Refactor auth',
      status: 'pending',
    });
  });

  it('truncates prompt when description is absent', () => {
    const part = makeTaskPart('pending', { prompt: 'a'.repeat(100) });
    const state = getChildSessionCardState(part);
    expect(state.taskName).toBe(`${'a'.repeat(60)}\u2026`);
  });

  it.each([
    ['running', 'running'],
    ['completed', 'completed'],
    ['error', 'error'],
  ] as const)('reports the task status for a %s task', (status, expected) => {
    const part = makeTaskPart(status);
    expect(getChildSessionCardState(part).status).toBe(expected);
  });

  it('does not need child messages to produce the card state', () => {
    const part = makeTaskPart('completed', {
      subagent_type: 'Researcher',
      description: 'Check spec',
    });
    // Metadata-only: the returned state is fully derived from the task part.
    expect(getChildSessionCardState(part)).toEqual({
      agentName: 'Researcher',
      taskName: 'Check spec',
      status: 'completed',
    });
  });
});

describe('getTaskToolSessionId', () => {
  it('returns undefined for a pending task with no metadata', () => {
    const part = makeTaskPart('pending');
    expect(getTaskToolSessionId(part)).toBeUndefined();
  });

  it('returns the session id from a running task metadata', () => {
    const part = makeTaskPart('running');
    expect(getTaskToolSessionId(part)).toBe(subagentSessionId);
  });

  it('returns the session id from a completed task metadata', () => {
    const part = makeTaskPart('completed');
    expect(getTaskToolSessionId(part)).toBe(subagentSessionId);
  });

  it('returns the session id from an errored task metadata', () => {
    const part = makeTaskPart('error');
    expect(getTaskToolSessionId(part)).toBe(subagentSessionId);
  });

  it('returns undefined for non-task tools', () => {
    const readPart = makeToolPart('read', {
      status: 'completed',
      input: { filePath: 'x' },
      output: 'y',
      title: 'read',
      metadata: {},
      time: { start: 1, end: 2 },
    });
    expect(getTaskToolSessionId(readPart)).toBeUndefined();
  });
});

describe('getChildSessionStreaming', () => {
  it('returns true when an assistant message has a running task with a matching sessionId', () => {
    const runningTask = makeTaskPart('running');
    const messages = [makeAssistantMessage([runningTask])];
    expect(getChildSessionStreaming(messages, subagentSessionId)).toBe(true);
  });

  it('returns false for a completed task with a matching sessionId', () => {
    const completedTask = makeTaskPart('completed');
    const messages = [makeAssistantMessage([completedTask])];
    expect(getChildSessionStreaming(messages, subagentSessionId)).toBe(false);
  });

  it('returns false for an errored task with a matching sessionId', () => {
    const erroredTask = makeTaskPart('error');
    const messages = [makeAssistantMessage([erroredTask])];
    expect(getChildSessionStreaming(messages, subagentSessionId)).toBe(false);
  });

  it('returns false when no task part matches the child sessionId', () => {
    const otherTask = makeTaskPart('running', {});
    const otherSessionId = 'ses-other' as KiloSessionId;
    const messages = [makeAssistantMessage([otherTask])];
    expect(getChildSessionStreaming(messages, otherSessionId)).toBe(false);
  });

  it('returns false when the only tool is a non-task tool', () => {
    const readPart = makeToolPart('read', {
      status: 'completed',
      input: { filePath: 'x' },
      output: 'y',
      title: 'read',
      metadata: {},
      time: { start: 1, end: 2 },
    });
    const messages = [makeAssistantMessage([readPart])];
    expect(getChildSessionStreaming(messages, subagentSessionId)).toBe(false);
  });

  it('returns false for an empty messages list', () => {
    expect(getChildSessionStreaming([], subagentSessionId)).toBe(false);
  });
});
