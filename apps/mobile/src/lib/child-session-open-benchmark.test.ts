import { describe, expect, it } from 'vitest';

import {
  buildChildSessionOpenReport,
  type Journey,
  type JourneyMeasurement,
  type JourneyTiming,
} from './child-session-open-benchmark';

function timing(overrides: Partial<JourneyTiming> & { journey: Journey }): JourneyTiming {
  return {
    phase: 'fresh',
    tapToFirstContentMs: 500,
    networkMs: 200,
    storageMs: 100,
    renderMs: 200,
    ...overrides,
  };
}

// Every journey present with a sensible after row, so each test overrides one
// journey without tripping the missing-journey throw.
function allJourneys(
  overrides: Partial<Record<Journey, JourneyMeasurement>> = {}
): Partial<Record<Journey, JourneyMeasurement>> {
  return {
    cold_open: { after: timing({ journey: 'cold_open' }) },
    warm_reopen: {
      after: timing({ journey: 'warm_reopen', phase: 'cached', networkMs: 0, storageMs: 0 }),
    },
    return_to_parent: { after: timing({ journey: 'return_to_parent' }) },
    many_children: {
      after: timing({ journey: 'many_children' }),
      siblingFetches: { before: 0, after: 0 },
    },
    slow_network: { after: timing({ journey: 'slow_network', networkMs: 800, storageMs: 50, renderMs: 50 }) },
    ...overrides,
  };
}

describe('child-session-open-benchmark', () => {
  it('builds the all-five-journeys report shape', () => {
    const report = buildChildSessionOpenReport(allJourneys());

    expect(Object.keys(report.journeys).toSorted()).toEqual([
      'cold_open',
      'many_children',
      'return_to_parent',
      'slow_network',
      'warm_reopen',
    ]);
    expect(report.journeys.cold_open.after).toMatchObject({ journey: 'cold_open', phase: 'fresh' });
    expect(report.journeys.warm_reopen.after?.phase).toBe('cached');
    expect(report.bottleneck).toMatchObject({
      name: expect.any(String),
      dominantPhase: expect.stringMatching(/^(network|storage|render)$/),
      evidence: expect.any(String),
    });
  });

  it('throws an error naming every missing journey', () => {
    const partial = allJourneys();
    delete partial.cold_open;
    delete partial.many_children;

    expect(() => buildChildSessionOpenReport(partial)).toThrow(/cold_open.*many_children/);
  });

  it('computes the per-journey before/after delta', () => {
    const report = buildChildSessionOpenReport(
      allJourneys({
        cold_open: {
          before: timing({ journey: 'cold_open', tapToFirstContentMs: 900 }),
          after: timing({ journey: 'cold_open', tapToFirstContentMs: 300 }),
        },
      })
    );

    expect(report.journeys.cold_open.deltaMs).toBe(300 - 900);
    // A journey that holds only an after row has no delta.
    expect(report.journeys.warm_reopen.deltaMs).toBeUndefined();
  });

  it('keeps a slow-network row where networkMs > renderMs', () => {
    const report = buildChildSessionOpenReport(allJourneys());

    const after = report.journeys.slow_network.after;
    expect(after).toBeDefined();
    expect(after?.networkMs).toBe(800);
    expect(after?.renderMs).toBe(50);
    expect(after && after.networkMs > after.renderMs).toBe(true);
    expect(report.bottleneck.dominantPhase).toBe('network');
  });

  it('names the sibling-transcript-prefetch bottleneck when siblingFetches drop', () => {
    const report = buildChildSessionOpenReport(
      allJourneys({
        many_children: {
          after: timing({ journey: 'many_children', networkMs: 300, renderMs: 50 }),
          siblingFetches: { before: 6, after: 0 },
        },
      })
    );

    expect(report.bottleneck.name).toBe('sibling-transcript-prefetch');
    expect(report.bottleneck.evidence).toContain('6');
    expect(report.bottleneck.evidence).toContain('0');
  });

  it('falls back to no-bottleneck when sibling fetch counts are equal', () => {
    const report = buildChildSessionOpenReport(allJourneys());

    expect(report.bottleneck.name).toBe('no-bottleneck');
  });
});
