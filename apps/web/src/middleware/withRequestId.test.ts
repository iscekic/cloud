import { type NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import type { NextRequestWithAuth } from 'next-auth/middleware';
import { REQUEST_ID_HEADER, withRequestId } from './withRequestId';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeRequest(headers: Record<string, string> = {}): NextRequestWithAuth {
  const request = new NextRequest('http://localhost:3000/api/trpc/session.list', {
    headers,
  }) as NextRequestWithAuth;
  request.nextauth = { token: null };
  return request;
}

const stubEvent = {} as NextFetchEvent;

function jsonMiddleware(body: Record<string, unknown>, init?: ResponseInit) {
  return async () => NextResponse.json(body, init);
}

describe('withRequestId', () => {
  it('reuses the incoming x-request-id on the response', async () => {
    const middleware = withRequestId(jsonMiddleware({ ok: true }));
    const response = await middleware(
      makeRequest({ 'x-request-id': 'req-from-client' }),
      stubEvent
    );

    expect(response?.headers.get(REQUEST_ID_HEADER)).toBe('req-from-client');
  });

  it('generates a UUID when the client sends no x-request-id', async () => {
    const middleware = withRequestId(jsonMiddleware({ ok: true }));
    const response = await middleware(makeRequest(), stubEvent);

    expect(response?.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_V4_PATTERN);
  });

  it('generates a distinct UUID per response', async () => {
    const middleware = withRequestId(jsonMiddleware({ ok: true }));
    const first = await middleware(makeRequest(), stubEvent);
    const second = await middleware(makeRequest(), stubEvent);

    const firstId = first?.headers.get(REQUEST_ID_HEADER);
    const secondId = second?.headers.get(REQUEST_ID_HEADER);
    expect(firstId).toMatch(UUID_V4_PATTERN);
    expect(secondId).toMatch(UUID_V4_PATTERN);
    expect(firstId).not.toBe(secondId);
  });

  it('stamps early-return responses, such as blocked clients', async () => {
    const middleware = withRequestId(
      jsonMiddleware({ error: 'upgrade_required' }, { status: 426 })
    );
    const response = await middleware(makeRequest(), stubEvent);

    expect(response?.status).toBe(426);
    expect(response?.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_V4_PATTERN);
  });
});
