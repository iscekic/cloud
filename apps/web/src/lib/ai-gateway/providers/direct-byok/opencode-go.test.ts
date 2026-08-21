import { getAiSdkProvider } from '../model-settings';
import type { GatewayRequest } from '../openrouter/types';
import type { Provider, TransformRequestContext } from '../types';
import openCodeGo from './opencode-go';

test('allows the Responses API for OpenCode Go', () => {
  expect(openCodeGo.supported_chat_apis).toContain('responses');
});

test.each([
  ['messages', 'x-api-key'],
  ['chat_completions', null],
  ['responses', null],
] as const)('uses the expected API key header for %s requests', (kind, apiKeyHeader) => {
  const provider = { apiKeyHeader: null } as Provider;
  const request = { kind, body: {} } as GatewayRequest;
  const extraHeaders = {};

  openCodeGo.transformRequest({ provider, request, extraHeaders } as TransformRequestContext);

  expect(provider.apiKeyHeader).toBe(apiKeyHeader);
  expect(extraHeaders).toEqual({});
});

describe('getAiSdkProvider', () => {
  test.each(['opencode-go/minimax-m3', 'opencode-go/qwen3.7-plus'])(
    'uses the Anthropic Messages API for OpenCode Go model %s',
    model => {
      expect(getAiSdkProvider(model, 'opencode-go')).toBe('anthropic');
    }
  );

  test('uses Chat Completions for MiniMax models from other direct providers', () => {
    expect(getAiSdkProvider('minimax/minimax-m2.5', 'crofai')).toBeUndefined();
  });

  test('uses OpenAI-compatible Chat Completions for Morph direct BYOK models', () => {
    expect(getAiSdkProvider('morph/morph-gpt-compatible', 'morph-byok')).toBe('openai-compatible');
  });

  test('uses Chat Completions for MiniMax models through the gateway', () => {
    expect(getAiSdkProvider('minimax/minimax-m2.5', null)).toBeUndefined();
  });
});
