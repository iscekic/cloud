import { execFileSync } from 'node:child_process';

import { kilocode_users, microdollar_usage } from '@kilocode/db/schema';
import { signKiloToken } from '@kilocode/worker-utils';
import { KILO_GATEWAY_AUDIENCE } from '@kilocode/worker-utils/internal-service-token-audiences';
import { eq, inArray } from 'drizzle-orm';

import { createSeedStripeCustomer, deleteSeedStripeCustomer } from './stripe';

export const GATEWAY_USAGE_USER_ID = 'dev-seed:gateway-usage:user';
export const GATEWAY_USAGE_START_DATE = '2026-08-01T00:00:00.000Z';
export const GATEWAY_USAGE_END_DATE = '2026-09-01T00:00:00.000Z';
export const GATEWAY_USAGE_FILTER_MODEL = 'anthropic/claude-sonnet-4';

const OTHER_USER_ID = 'dev-seed:gateway-usage:other-user';
const GATEWAY_USAGE_USER_EMAIL = 'gateway-usage@dev-seed.invalid';
const GATEWAY_USAGE_USER_NAME = 'Gateway usage fixture';
const API_TOKEN_PEPPER = 'dev-seed:gateway-usage:pepper';
const TOKEN_EXPIRES_SECONDS = 3600;
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 500;
const NEXTJS_SERVICE_NAME = 'nextjs';

type UsageGroup = {
  model: string | null;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  costMicrodollars: number;
};

type NextjsServiceStatus = {
  name: typeof NEXTJS_SERVICE_NAME;
  status: 'up' | 'down';
  port: number;
};

export const GATEWAY_USAGE_EXPECTED_GROUPS: UsageGroup[] = [
  {
    model: GATEWAY_USAGE_FILTER_MODEL,
    requestCount: 2,
    inputTokens: 90,
    outputTokens: 60,
    cacheWriteTokens: 15,
    cacheHitTokens: 20,
    totalTokens: 150,
    costMicrodollars: 700,
  },
  {
    model: 'openai/gpt-5',
    requestCount: 1,
    inputTokens: 50,
    outputTokens: 30,
    cacheWriteTokens: 0,
    cacheHitTokens: 10,
    totalTokens: 80,
    costMicrodollars: 400,
  },
];

export function buildGatewayUsageFixture(stripeCustomerId: string) {
  const user = {
    id: GATEWAY_USAGE_USER_ID,
    google_user_email: GATEWAY_USAGE_USER_EMAIL,
    google_user_name: GATEWAY_USAGE_USER_NAME,
    google_user_image_url: 'https://example.invalid/gateway-usage.png',
    stripe_customer_id: stripeCustomerId,
    api_token_pepper: API_TOKEN_PEPPER,
    has_validation_stytch: true,
    customer_source: 'dev-seed',
  } satisfies typeof kilocode_users.$inferInsert;

  const usageRows = [
    {
      id: '00000000-0000-4000-8000-000000003751',
      kilo_user_id: GATEWAY_USAGE_USER_ID,
      cost: 400,
      input_tokens: 60,
      output_tokens: 40,
      cache_write_tokens: 10,
      cache_hit_tokens: 5,
      created_at: '2026-08-10T10:00:00.000Z',
      provider: 'anthropic',
      model: 'anthropic/claude-sonnet-4-20250514',
      requested_model: GATEWAY_USAGE_FILTER_MODEL,
    },
    {
      id: '00000000-0000-4000-8000-000000003752',
      kilo_user_id: GATEWAY_USAGE_USER_ID,
      cost: 300,
      input_tokens: 30,
      output_tokens: 20,
      cache_write_tokens: 5,
      cache_hit_tokens: 15,
      created_at: '2026-08-20T10:00:00.000Z',
      provider: 'anthropic',
      model: GATEWAY_USAGE_FILTER_MODEL,
      requested_model: GATEWAY_USAGE_FILTER_MODEL,
    },
    {
      id: '00000000-0000-4000-8000-000000003753',
      kilo_user_id: GATEWAY_USAGE_USER_ID,
      cost: 400,
      input_tokens: 50,
      output_tokens: 30,
      cache_write_tokens: 0,
      cache_hit_tokens: 10,
      created_at: '2026-08-25T10:00:00.000Z',
      provider: 'openai',
      model: 'openai/gpt-5',
      requested_model: null,
    },
    {
      id: '00000000-0000-4000-8000-000000003754',
      kilo_user_id: GATEWAY_USAGE_USER_ID,
      cost: 9_999,
      input_tokens: 9_999,
      output_tokens: 9_999,
      cache_write_tokens: 9_999,
      cache_hit_tokens: 9_999,
      created_at: GATEWAY_USAGE_END_DATE,
      provider: 'anthropic',
      model: GATEWAY_USAGE_FILTER_MODEL,
      requested_model: GATEWAY_USAGE_FILTER_MODEL,
    },
    {
      id: '00000000-0000-4000-8000-000000003755',
      kilo_user_id: OTHER_USER_ID,
      cost: 8_888,
      input_tokens: 8_888,
      output_tokens: 8_888,
      cache_write_tokens: 8_888,
      cache_hit_tokens: 8_888,
      created_at: '2026-08-15T10:00:00.000Z',
      provider: 'anthropic',
      model: GATEWAY_USAGE_FILTER_MODEL,
      requested_model: GATEWAY_USAGE_FILTER_MODEL,
    },
  ] satisfies (typeof microdollar_usage.$inferInsert)[];

  return { user, usageRows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseNextjsServiceStatus(json: string): NextjsServiceStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('dev:status --json did not return valid JSON');
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.services)) {
    throw new Error('dev:status --json returned no services array');
  }

  const entry = parsed.services.find(
    (service): service is Record<string, unknown> =>
      isRecord(service) && service.name === NEXTJS_SERVICE_NAME
  );
  if (!entry) {
    throw new Error(`dev:status --json did not report the ${NEXTJS_SERVICE_NAME} service`);
  }
  if (entry.status !== 'up' && entry.status !== 'down') {
    throw new Error(`dev:status --json reported an invalid status for ${NEXTJS_SERVICE_NAME}`);
  }
  if (typeof entry.port !== 'number' || !Number.isInteger(entry.port) || entry.port <= 0) {
    throw new Error(`dev:status --json reported an invalid port for ${NEXTJS_SERVICE_NAME}`);
  }

  return { name: NEXTJS_SERVICE_NAME, status: entry.status, port: entry.port };
}

function readNumber(record: Record<string, unknown>, key: keyof UsageGroup): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Gateway usage response has an invalid ${key}`);
  }
  return value;
}

function parseUsageGroup(value: unknown): UsageGroup {
  if (!isRecord(value) || (typeof value.model !== 'string' && value.model !== null)) {
    throw new Error('Gateway usage response has an invalid usage group');
  }
  return {
    model: value.model,
    requestCount: readNumber(value, 'requestCount'),
    inputTokens: readNumber(value, 'inputTokens'),
    outputTokens: readNumber(value, 'outputTokens'),
    cacheWriteTokens: readNumber(value, 'cacheWriteTokens'),
    cacheHitTokens: readNumber(value, 'cacheHitTokens'),
    totalTokens: readNumber(value, 'totalTokens'),
    costMicrodollars: readNumber(value, 'costMicrodollars'),
  };
}

export function validateGatewayUsageResponse(
  status: number,
  payload: unknown,
  expectedGroups: UsageGroup[]
) {
  if (status !== 200) {
    throw new Error(`Gateway usage returned HTTP ${status}, expected 200`);
  }
  if (!isRecord(payload) || !isRecord(payload.period) || !Array.isArray(payload.usage)) {
    throw new Error('Gateway usage response has an invalid shape');
  }
  if (
    payload.period.startDate !== GATEWAY_USAGE_START_DATE ||
    payload.period.endDate !== GATEWAY_USAGE_END_DATE
  ) {
    throw new Error('Gateway usage response has an unexpected period');
  }

  const groups = payload.usage.map(parseUsageGroup);
  if (JSON.stringify(groups) !== JSON.stringify(expectedGroups)) {
    throw new Error(`Gateway usage response has unexpected groups: ${JSON.stringify(groups)}`);
  }

  return {
    modelGroups: groups.length,
    requestCount: groups.reduce((total, group) => total + group.requestCount, 0),
    totalTokens: groups.reduce((total, group) => total + group.totalTokens, 0),
    costMicrodollars: groups.reduce((total, group) => total + group.costMicrodollars, 0),
  };
}

function readNextjsStatusJson(): string {
  try {
    return execFileSync('pnpm', ['-s', 'dev:status', '--json'], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(
      `dev:status --json failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function usageUrl(baseUrl: string, model?: string): string {
  const url = new URL('/api/gateway/usage', baseUrl);
  url.searchParams.set('startDate', GATEWAY_USAGE_START_DATE);
  url.searchParams.set('endDate', GATEWAY_USAGE_END_DATE);
  if (model !== undefined) url.searchParams.set('model', model);
  return url.toString();
}

async function waitForNextjs(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastResult = 'no response';

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    try {
      const response = await fetch(usageUrl(baseUrl), {
        signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, remainingMs))),
      });
      lastResult = `HTTP ${response.status}`;
      if (response.status === 401) return;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }

    const sleepMs = Math.min(READY_POLL_MS, deadline - Date.now());
    if (sleepMs > 0) await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  throw new Error(`Next.js was not ready within 120 seconds: ${lastResult}`);
}

async function requestJson(
  url: string,
  token?: string
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Gateway usage returned non-JSON with HTTP ${response.status}`);
  }
  return { status: response.status, body };
}

function requireStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} returned HTTP ${actual}, expected ${expected}`);
  }
}

export async function runGatewayUsageLiveCheck() {
  const { getSeedDb } = await import('./db');
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set for this worktree. Ensure local env is prepared (pnpm dev:worktree:prepare).'
    );
  }

  const db = getSeedDb();
  const [existingUser] = await db
    .select({ stripeCustomerId: kilocode_users.stripe_customer_id })
    .from(kilocode_users)
    .where(eq(kilocode_users.id, GATEWAY_USAGE_USER_ID))
    .limit(1);
  const stripeCustomer = await createSeedStripeCustomer({
    email: GATEWAY_USAGE_USER_EMAIL,
    name: GATEWAY_USAGE_USER_NAME,
    kiloUserId: GATEWAY_USAGE_USER_ID,
  });
  const fixture = buildGatewayUsageFixture(stripeCustomer.id);
  try {
    await db.transaction(async tx => {
      await tx.delete(microdollar_usage).where(
        inArray(
          microdollar_usage.id,
          fixture.usageRows.map(row => row.id)
        )
      );
      await tx
        .insert(kilocode_users)
        .values(fixture.user)
        .onConflictDoUpdate({
          target: kilocode_users.id,
          set: {
            google_user_email: fixture.user.google_user_email,
            google_user_name: fixture.user.google_user_name,
            google_user_image_url: fixture.user.google_user_image_url,
            stripe_customer_id: fixture.user.stripe_customer_id,
            api_token_pepper: fixture.user.api_token_pepper,
            has_validation_stytch: fixture.user.has_validation_stytch,
            customer_source: fixture.user.customer_source,
          },
        });
      await tx.insert(microdollar_usage).values(fixture.usageRows);
    });
  } catch (error) {
    await deleteSeedStripeCustomer(stripeCustomer.id);
    throw error;
  }
  if (existingUser && existingUser.stripeCustomerId !== stripeCustomer.id) {
    await deleteSeedStripeCustomer(existingUser.stripeCustomerId);
  }

  const { token } = await signKiloToken({
    userId: fixture.user.id,
    pepper: fixture.user.api_token_pepper,
    secret,
    expiresInSeconds: TOKEN_EXPIRES_SECONDS,
    audience: KILO_GATEWAY_AUDIENCE,
    env: process.env.NODE_ENV ?? 'development',
  });

  const service = parseNextjsServiceStatus(readNextjsStatusJson());
  const baseUrl = `http://localhost:${service.port}`;
  await waitForNextjs(baseUrl);

  const complete = await requestJson(usageUrl(baseUrl), token);
  const totals = validateGatewayUsageResponse(
    complete.status,
    complete.body,
    GATEWAY_USAGE_EXPECTED_GROUPS
  );

  const filtered = await requestJson(usageUrl(baseUrl, GATEWAY_USAGE_FILTER_MODEL), token);
  const filteredTotals = validateGatewayUsageResponse(
    filtered.status,
    filtered.body,
    GATEWAY_USAGE_EXPECTED_GROUPS.slice(0, 1)
  );

  const empty = await requestJson(usageUrl(baseUrl, 'unknown/model'), token);
  const emptyTotals = validateGatewayUsageResponse(empty.status, empty.body, []);

  const unauthorized = await requestJson(usageUrl(baseUrl));
  requireStatus(unauthorized.status, 401, 'Missing authentication');

  const reversedUrl = new URL(usageUrl(baseUrl));
  reversedUrl.searchParams.set('startDate', GATEWAY_USAGE_END_DATE);
  reversedUrl.searchParams.set('endDate', GATEWAY_USAGE_START_DATE);
  const invalid = await requestJson(reversedUrl.toString(), token);
  requireStatus(invalid.status, 400, 'Reversed period bounds');

  return {
    status: complete.status,
    ...totals,
    filteredGroups: filteredTotals.modelGroups,
    filteredRequestCount: filteredTotals.requestCount,
    emptyGroups: emptyTotals.modelGroups,
    unauthorizedStatus: unauthorized.status,
    invalidStatus: invalid.status,
    nextjsPort: service.port,
  };
}
