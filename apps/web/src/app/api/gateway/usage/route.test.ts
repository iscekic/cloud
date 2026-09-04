jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/user/server', () => ({ getUserFromAuth: jest.fn() }));
jest.mock('@/lib/drizzle', () => ({ readDb: { transaction: jest.fn() } }));

import { captureException } from '@sentry/nextjs';
import { KILO_GATEWAY_AUDIENCE } from '@kilocode/worker-utils/internal-service-token-audiences';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest, NextResponse } from 'next/server';

import { readDb } from '@/lib/drizzle';
import { getUserFromAuth } from '@/lib/user/server';
import { GET } from './route';

const mockCaptureException = jest.mocked(captureException);
const mockGetUserFromAuth = jest.mocked(getUserFromAuth);
const mockTransaction = jest.mocked(readDb.transaction);
const mockExecute = jest.fn<Promise<{ rows: unknown[] }>, [SQL]>();
const USER_ID = 'oauth/google/test-user';
const START_DATE = '2026-08-01T00:00:00.000Z';
const END_DATE = '2026-09-01T00:00:00.000Z';

function request(params = `startDate=${START_DATE}&endDate=${END_DATE}`) {
  return new NextRequest(`http://localhost:3000/api/gateway/usage?${params}`);
}

function aggregateQuery() {
  return new PgDialect().sqlToQuery(mockExecute.mock.calls[1][0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
  mockGetUserFromAuth.mockResolvedValue({
    user: { id: USER_ID },
    authFailedResponse: null,
  } as never);
  mockExecute.mockResolvedValue({ rows: [] });
  mockTransaction.mockImplementation(async callback => callback({ execute: mockExecute } as never));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/gateway/usage', () => {
  it('authenticates for the gateway audience before returning the existing failure response', async () => {
    const authFailedResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetUserFromAuth.mockResolvedValue({ user: null, authFailedResponse } as never);

    const response = await GET(request(''));

    expect(response).toBe(authFailedResponse);
    expect(response.status).toBe(401);
    expect(mockGetUserFromAuth).toHaveBeenCalledWith({
      adminOnly: false,
      expectedAudience: KILO_GATEWAY_AUDIENCE,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['missing startDate', `endDate=${END_DATE}`, 'startDate'],
    ['missing endDate', `startDate=${START_DATE}`, 'endDate'],
    ['malformed startDate', `startDate=2026-08-01&endDate=${END_DATE}`, 'startDate'],
    ['malformed endDate', `startDate=${START_DATE}&endDate=tomorrow`, 'endDate'],
    ['equal bounds', `startDate=${START_DATE}&endDate=${START_DATE}`, 'endDate'],
    ['reversed bounds', `startDate=${END_DATE}&endDate=${START_DATE}`, 'endDate'],
    ['blank model', `startDate=${START_DATE}&endDate=${END_DATE}&model=%20%09`, 'model'],
    [
      'oversized model',
      `startDate=${START_DATE}&endDate=${END_DATE}&model=${'a'.repeat(257)}`,
      'model',
    ],
  ])('rejects %s before database access', async (_case, params, field) => {
    const response = await GET(request(params));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid query parameters',
      details: { [field]: expect.any(Array) },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('queries user-owned usage over a half-open period grouped and ordered by effective model', async () => {
    await GET(request());

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(new PgDialect().sqlToQuery(mockExecute.mock.calls[0][0])).toMatchObject({
      sql: "SET LOCAL statement_timeout = '5000'",
      params: [],
    });
    const query = aggregateQuery();
    expect(query.sql.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT COALESCE(mu.requested_model, mu.model) AS model, ' +
        'COUNT(*)::float AS "requestCount", SUM(mu.input_tokens)::float AS "inputTokens", ' +
        'SUM(mu.output_tokens)::float AS "outputTokens", ' +
        'SUM(mu.cache_write_tokens)::float AS "cacheWriteTokens", ' +
        'SUM(mu.cache_hit_tokens)::float AS "cacheHitTokens", ' +
        '(SUM(mu.input_tokens) + SUM(mu.output_tokens))::float AS "totalTokens", ' +
        'SUM(mu.cost)::float AS "costMicrodollars" FROM microdollar_usage mu ' +
        'WHERE mu.kilo_user_id = $1 AND mu.created_at >= $2::timestamptz ' +
        'AND mu.created_at < $3::timestamptz ' +
        'GROUP BY COALESCE(mu.requested_model, mu.model) ' +
        'ORDER BY COALESCE(mu.requested_model, mu.model) ASC NULLS LAST'
    );
    expect(query.params).toEqual([USER_ID, START_DATE, END_DATE]);
  });

  it('trims and binds an optional effective-model filter', async () => {
    const model = "provider/model' OR 1=1 --";

    await GET(
      request(
        `startDate=${START_DATE}&endDate=${END_DATE}&model=${encodeURIComponent(`  ${model}  `)}`
      )
    );

    const query = aggregateQuery();
    expect(query.sql).toContain('COALESCE(mu.requested_model, mu.model) = $4');
    expect(query.sql).not.toContain(model);
    expect(query.params).toEqual([USER_ID, START_DATE, END_DATE, model]);
  });

  it('returns exact numeric aggregates for requested, resolved, and nullable model groups', async () => {
    const usage = [
      {
        model: 'requested/model',
        requestCount: 2,
        inputTokens: 10,
        outputTokens: 20,
        cacheWriteTokens: 3,
        cacheHitTokens: 4,
        totalTokens: 30,
        costMicrodollars: 50,
      },
      {
        model: 'resolved/model',
        requestCount: 1,
        inputTokens: 7,
        outputTokens: 8,
        cacheWriteTokens: 0,
        cacheHitTokens: 2,
        totalTokens: 15,
        costMicrodollars: 25,
      },
      {
        model: null,
        requestCount: 1,
        inputTokens: 1,
        outputTokens: 2,
        cacheWriteTokens: 0,
        cacheHitTokens: 0,
        totalTokens: 3,
        costMicrodollars: 5,
      },
    ];
    mockExecute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: usage });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      period: { startDate: START_DATE, endDate: END_DATE },
      usage,
    });
    expect(aggregateQuery().sql).toContain('COALESCE(mu.requested_model, mu.model) AS model');
    expect(aggregateQuery().sql).toContain(
      '(SUM(mu.input_tokens) + SUM(mu.output_tokens))::float AS "totalTokens"'
    );
  });

  it('returns an empty usage array for a valid interval without rows', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      period: { startDate: START_DATE, endDate: END_DATE },
      usage: [],
    });
  });

  it('returns a sanitized temporary failure and succeeds when the caller retries', async () => {
    const error = new Error('database unavailable');
    mockTransaction.mockRejectedValueOnce(error);

    const failedResponse = await GET(request());

    expect(failedResponse.status).toBe(503);
    await expect(failedResponse.json()).resolves.toEqual({
      error: 'Usage data temporarily unavailable',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { endpoint: 'gateway/usage' },
    });

    mockTransaction.mockImplementation(async callback =>
      callback({ execute: mockExecute } as never)
    );
    const retryResponse = await GET(request());
    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toEqual({
      period: { startDate: START_DATE, endDate: END_DATE },
      usage: [],
    });
  });

  it('sanitizes unexpected authentication failures before database access', async () => {
    const error = new Error('authentication storage unavailable');
    mockGetUserFromAuth.mockRejectedValue(error);

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Usage data temporarily unavailable',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: { endpoint: 'gateway/usage' },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
