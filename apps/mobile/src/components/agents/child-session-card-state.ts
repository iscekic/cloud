import {
  type KiloSessionId,
  type StoredMessage,
  type ToolPart,
} from '@kilocode/cloud-agent-sdk';

import { i18n } from '@/i18n';

import { isToolPart } from './part-types';
import { truncateText } from './tool-card-utils';

export type ChildSessionStatus = 'running' | 'pending' | 'completed' | 'error';

export type ChildSessionCardState = {
  agentName: string;
  taskName: string;
  status: ChildSessionStatus;
};

function getStringProperty(obj: unknown, key: string): string | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- generic payload walker over heterogeneous tool inputs; no static shape to narrow against
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return undefined;
  }
  const value = (obj as Record<string, unknown>)[key];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- generic payload walker over heterogeneous tool inputs; no static shape to narrow against
  return typeof value === 'string' ? value : undefined;
}

/**
 * Derives the card title and status from the task tool part metadata only, so
 * rendering a card never fetches the child transcript. Mirrors web's
 * `getTaskDescription`/`getTaskAgent` metadata read.
 */
export function getChildSessionCardState(part: ToolPart): ChildSessionCardState {
  const input = part.state.input;
  const agentName =
    getStringProperty(input, 'subagent_type') ?? i18n.t('agentChat.childSession.subagent');
  const description = getStringProperty(input, 'description');
  const prompt = getStringProperty(input, 'prompt');
  const taskName =
    description ?? (prompt ? truncateText(prompt, 60) : i18n.t('agentChat.childSession.task'));

  return { agentName, taskName, status: part.state.status };
}

export function getTaskToolSessionId(part: ToolPart): KiloSessionId | undefined {
  if (part.tool !== 'task') {
    return undefined;
  }
  const { state } = part;
  if (state.status === 'running' || state.status === 'completed' || state.status === 'error') {
    return getStringProperty(state.metadata, 'sessionId') as KiloSessionId | undefined;
  }
  return undefined;
}

export function getChildSessionStreaming(
  messages: StoredMessage[],
  childSessionId: KiloSessionId
): boolean {
  for (const message of messages) {
    if (message.info.role === 'assistant') {
      for (const part of message.parts) {
        if (
          isToolPart(part) &&
          part.tool === 'task' &&
          part.state.status === 'running' &&
          getTaskToolSessionId(part) === childSessionId
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
