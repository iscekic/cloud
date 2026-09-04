import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGatewayUsageFixture,
  GATEWAY_USAGE_END_DATE,
  GATEWAY_USAGE_EXPECTED_GROUPS,
  GATEWAY_USAGE_FILTER_MODEL,
  GATEWAY_USAGE_START_DATE,
  GATEWAY_USAGE_USER_ID,
  parseNextjsServiceStatus,
  validateGatewayUsageResponse,
} from './gateway-usage';

void test('builds stable in-period, end-boundary, and other-user usage rows', () => {
  const fixture = buildGatewayUsageFixture('cus_test_gateway_usage');

  assert.equal(fixture.user.id, GATEWAY_USAGE_USER_ID);
  assert.equal(fixture.user.stripe_customer_id, 'cus_test_gateway_usage');
  assert.match(fixture.user.id, /^dev-seed:/);
  assert.equal(fixture.usageRows.length, 5);
  assert.equal(new Set(fixture.usageRows.map(row => row.id)).size, 5);

  const inPeriod = fixture.usageRows.filter(
    row =>
      row.kilo_user_id === GATEWAY_USAGE_USER_ID &&
      row.created_at >= GATEWAY_USAGE_START_DATE &&
      row.created_at < GATEWAY_USAGE_END_DATE
  );
  assert.equal(inPeriod.length, 3);
  assert.equal(
    inPeriod.reduce((total, row) => total + row.input_tokens + row.output_tokens, 0),
    230
  );
  assert.equal(
    inPeriod.reduce((total, row) => total + row.cost, 0),
    1_100
  );
  assert.equal(
    inPeriod.filter(row => (row.requested_model ?? row.model) === GATEWAY_USAGE_FILTER_MODEL)
      .length,
    2
  );
  assert.equal(
    fixture.usageRows.filter(
      row => row.kilo_user_id === GATEWAY_USAGE_USER_ID && row.created_at === GATEWAY_USAGE_END_DATE
    ).length,
    1
  );
  assert.equal(
    fixture.usageRows.filter(row => row.kilo_user_id !== GATEWAY_USAGE_USER_ID).length,
    1
  );
});

void test('parses the nextjs port from dev status JSON', () => {
  assert.deepEqual(
    parseNextjsServiceStatus(
      JSON.stringify({
        session: 'kilo-dev-test',
        services: [
          { name: 'postgres', port: 5432, status: 'up' },
          { name: 'nextjs', port: 3100, status: 'down' },
        ],
      })
    ),
    { name: 'nextjs', port: 3100, status: 'down' }
  );

  assert.throws(() => parseNextjsServiceStatus('not-json'), /did not return valid JSON/);
  assert.throws(() => parseNextjsServiceStatus('{}'), /returned no services array/);
  assert.throws(
    () => parseNextjsServiceStatus('{"services":[]}'),
    /did not report the nextjs service/
  );
  assert.throws(
    () => parseNextjsServiceStatus('{"services":[{"name":"nextjs","port":0,"status":"up"}]}'),
    /invalid port/
  );
});

void test('validates exact grouped totals and empty responses', () => {
  const period = { startDate: GATEWAY_USAGE_START_DATE, endDate: GATEWAY_USAGE_END_DATE };
  assert.deepEqual(
    validateGatewayUsageResponse(
      200,
      { period, usage: GATEWAY_USAGE_EXPECTED_GROUPS },
      GATEWAY_USAGE_EXPECTED_GROUPS
    ),
    { modelGroups: 2, requestCount: 3, totalTokens: 230, costMicrodollars: 1_100 }
  );
  assert.deepEqual(validateGatewayUsageResponse(200, { period, usage: [] }, []), {
    modelGroups: 0,
    requestCount: 0,
    totalTokens: 0,
    costMicrodollars: 0,
  });

  assert.throws(
    () => validateGatewayUsageResponse(503, { period, usage: [] }, []),
    /HTTP 503, expected 200/
  );
  assert.throws(
    () => validateGatewayUsageResponse(200, { period, usage: [] }, GATEWAY_USAGE_EXPECTED_GROUPS),
    /unexpected groups/
  );
});
