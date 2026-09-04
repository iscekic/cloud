import { captureException } from '@sentry/nextjs';
import { KILO_GATEWAY_AUDIENCE } from '@kilocode/worker-utils/internal-service-token-audiences';
import { sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { readDb } from '@/lib/drizzle';
import { getUserFromAuth } from '@/lib/user/server';
import { timedUsageQuery } from '@/lib/usage-query';

const QuerySchema = z
  .object({
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
    model: z.string().trim().min(1).max(256).optional(),
  })
  .refine(({ startDate, endDate }) => Date.parse(startDate) < Date.parse(endDate), {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });

type UsageRow = {
  model: string | null;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  costMicrodollars: number;
};

export async function GET(request: NextRequest) {
  try {
    const { user, authFailedResponse } = await getUserFromAuth({
      adminOnly: false,
      expectedAudience: KILO_GATEWAY_AUDIENCE,
    });
    if (authFailedResponse) return authFailedResponse;

    const parsed = QuerySchema.safeParse({
      startDate: request.nextUrl.searchParams.get('startDate'),
      endDate: request.nextUrl.searchParams.get('endDate'),
      model: request.nextUrl.searchParams.get('model') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { startDate, endDate, model } = parsed.data;
    const usage = await timedUsageQuery(
      {
        db: readDb,
        route: 'gateway/usage',
        queryLabel: 'usage_by_effective_model',
        scope: 'user',
        period: `${startDate}/${endDate}`,
      },
      async tx => {
        const result = await tx.execute(sql`
          SELECT
            COALESCE(mu.requested_model, mu.model) AS model,
            COUNT(*)::float AS "requestCount",
            SUM(mu.input_tokens)::float AS "inputTokens",
            SUM(mu.output_tokens)::float AS "outputTokens",
            SUM(mu.cache_write_tokens)::float AS "cacheWriteTokens",
            SUM(mu.cache_hit_tokens)::float AS "cacheHitTokens",
            (SUM(mu.input_tokens) + SUM(mu.output_tokens))::float AS "totalTokens",
            SUM(mu.cost)::float AS "costMicrodollars"
          FROM microdollar_usage mu
          WHERE mu.kilo_user_id = ${user.id}
            AND mu.created_at >= ${startDate}::timestamptz
            AND mu.created_at < ${endDate}::timestamptz
            ${model === undefined ? sql`` : sql`AND COALESCE(mu.requested_model, mu.model) = ${model}`}
          GROUP BY COALESCE(mu.requested_model, mu.model)
          ORDER BY COALESCE(mu.requested_model, mu.model) ASC NULLS LAST
        `);
        return result.rows as UsageRow[];
      }
    );

    return NextResponse.json({ period: { startDate, endDate }, usage });
  } catch (error) {
    captureException(error, { tags: { endpoint: 'gateway/usage' } });
    return NextResponse.json({ error: 'Usage data temporarily unavailable' }, { status: 503 });
  }
}
