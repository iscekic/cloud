import { describe, expect, it } from 'vitest';

import { type InstancePickerInstance } from '@/lib/picker-bridge';

import { labelInstances, resolveInstancePickerViewState } from './instance-picker-rows';

// Fixed timestamps so facts formatting is deterministic (2 hours apart).
const START_1 = Date.UTC(2026, 0, 1, 10, 0);
const START_2 = Date.UTC(2026, 0, 1, 12, 0);

// Fixed locale so the start-time formatting (and therefore the facts strings
// the disambiguation rules compare) is deterministic in CI.
const LOCALE = 'en';

function instance(overrides: Partial<InstancePickerInstance>): InstancePickerInstance {
  return {
    connectionId: 'conn-1',
    name: 'laptop',
    projectName: 'kilo',
    ...overrides,
  };
}

/** Returns the first element of a non-empty list, typed without `| undefined`. */
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) {
    throw new Error('expected at least one item');
  }
  return item;
}

describe('labelInstances', () => {
  it('returns an empty list for no instances', () => {
    expect(labelInstances([], LOCALE)).toEqual([]);
  });

  it('groups explicit remotes under remote and everything else under terminal', () => {
    const result = labelInstances(
      [
        instance({ connectionId: 'r', name: 'remote-box', kind: 'remote' }),
        instance({ connectionId: 'c', name: 'cli-box', kind: 'cli' }),
        instance({ connectionId: 'l', name: 'legacy-box' }),
      ],
      LOCALE
    );
    const byConn = new Map(result.map(row => [row.connectionId, row.group]));
    expect(byConn.get('r')).toBe('remote');
    expect(byConn.get('c')).toBe('terminal');
    expect(byConn.get('l')).toBe('terminal');
  });

  it('keeps an old instance without kind as a plain terminal (legacy fallback)', () => {
    const row = first(labelInstances([instance({ connectionId: 'legacy' })], LOCALE));
    expect(row.group).toBe('terminal');
    expect(row.facts).toBeNull();
    expect(row.dedupSuffix).toBeNull();
  });

  it('composes facts from start time and branch, joined with ·', () => {
    const row = first(
      labelInstances(
        [instance({ connectionId: 'a', startedAt: START_1, branch: 'main' })],
        LOCALE
      )
    );
    expect(row.facts).toContain(' · ');
    expect(row.facts).toContain('main');
  });

  it('falls back to workingDirectory when branch is absent', () => {
    const row = first(
      labelInstances(
        [
          instance({ connectionId: 'a', startedAt: START_1, workingDirectory: '/home/kilo' }),
        ],
        LOCALE
      )
    );
    expect(row.facts).toContain('/home/kilo');
  });

  it('returns null facts when neither start time nor branch/workingDirectory is present', () => {
    const row = first(labelInstances([instance({ connectionId: 'a' })], LOCALE));
    expect(row.facts).toBeNull();
  });

  it('formats the start time with the caller-provided locale', () => {
    const row = first(
      labelInstances(
        [
          instance({
            connectionId: 'a',
            startedAt: START_1,
            branch: 'main',
          }),
        ],
        LOCALE
      )
    );
    // `en` uses a comma between the weekday-free date and time parts; the
    // exact string is locale-specific, so assert the stable `en` shape.
    expect(row.facts).toMatch(/^\w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M · main$/);
  });

  it('does not stamp a suffix when peers have distinct, present facts', () => {
    const result = labelInstances(
      [
        instance({ connectionId: 'a', startedAt: START_1, branch: 'main' }),
        instance({ connectionId: 'b', startedAt: START_2, branch: 'feat/x' }),
      ],
      LOCALE
    );
    expect(result.map(row => row.dedupSuffix)).toEqual([null, null]);
    expect(new Set(result.map(row => row.facts)).size).toBe(2);
  });

  it('stamps a suffix when peers share identical facts', () => {
    const result = labelInstances(
      [
        instance({ connectionId: 'a', startedAt: START_1, branch: 'main' }),
        instance({ connectionId: 'b', startedAt: START_1, branch: 'main' }),
      ],
      LOCALE
    );
    const suffixes = result.map(row => row.dedupSuffix);
    expect(suffixes.every(suffix => suffix !== null)).toBe(true);
    expect(new Set(suffixes).size).toBe(2);
  });

  it('stamps only the missing-facts peer when one peer has facts and the other does not', () => {
    const result = labelInstances(
      [
        instance({ connectionId: 'a', startedAt: START_1, branch: 'main' }),
        instance({ connectionId: 'b' }),
      ],
      LOCALE
    );
    expect(result[0]?.dedupSuffix).toBeNull();
    expect(result[1]?.dedupSuffix).not.toBeNull();
  });

  it('stamps only the colliding peers, leaving a distinct-facts peer unstamped', () => {
    const result = labelInstances(
      [
        instance({ connectionId: 'a', startedAt: START_1, branch: 'main' }),
        instance({ connectionId: 'b', startedAt: START_1, branch: 'main' }),
        instance({ connectionId: 'c', startedAt: START_2, branch: 'feat/x' }),
      ],
      LOCALE
    );
    const byConn = new Map(result.map(row => [row.connectionId, row.dedupSuffix]));
    expect(byConn.get('a')).not.toBeNull();
    expect(byConn.get('b')).not.toBeNull();
    expect(byConn.get('c')).toBeNull();
  });

  it('is stable: running again with the same input yields the same suffixes', () => {
    const input = [
      instance({ connectionId: 'a', startedAt: START_1, branch: 'main' }),
      instance({ connectionId: 'b', startedAt: START_1, branch: 'main' }),
    ];
    const firstSuffixes = labelInstances(input, LOCALE).map(row => row.dedupSuffix);
    const secondSuffixes = labelInstances(input, LOCALE).map(row => row.dedupSuffix);
    expect(secondSuffixes).toEqual(firstSuffixes);
  });

  it('preserves input order', () => {
    const input = [
      instance({ connectionId: 'a' }),
      instance({ connectionId: 'b' }),
      instance({ connectionId: 'c' }),
    ];
    expect(labelInstances(input, LOCALE).map(row => row.connectionId)).toEqual(['a', 'b', 'c']);
  });

  it('does not stamp a suffix on a lone row even when its facts are missing', () => {
    const row = first(labelInstances([instance({ connectionId: 'solo' })], LOCALE));
    expect(row.dedupSuffix).toBeNull();
  });
});

describe('resolveInstancePickerViewState', () => {
  it('is "loading" whenever the query has never produced data, regardless of isError', () => {
    expect(
      resolveInstancePickerViewState({ isLoading: true, isError: false, instances: [] })
    ).toEqual({
      kind: 'loading',
    });
    // isLoading takes priority — a query cannot be simultaneously "never
    // produced data" and "produced an error response" in TanStack Query's
    // own state machine, but the classifier's precedence must still favor
    // loading defensively.
    expect(
      resolveInstancePickerViewState({ isLoading: true, isError: true, instances: [] })
    ).toEqual({
      kind: 'loading',
    });
  });

  it('is "error" — distinct from a successful empty response — when the query failed', () => {
    const errorState = resolveInstancePickerViewState({
      isLoading: false,
      isError: true,
      instances: [],
    });
    const emptyState = resolveInstancePickerViewState({
      isLoading: false,
      isError: false,
      instances: [],
    });
    expect(errorState).toEqual({ kind: 'error' });
    expect(errorState.kind).not.toBe(emptyState.kind);
  });

  it('is "ready" with an empty instances array for a successful zero-instance response (the Empty state)', () => {
    expect(
      resolveInstancePickerViewState({ isLoading: false, isError: false, instances: [] })
    ).toEqual({
      kind: 'ready',
      instances: [],
    });
  });

  it('is "ready" with the full instances array for a successful populated response (the Happy state)', () => {
    const instances = [instance({ connectionId: 'a' }), instance({ connectionId: 'b' })];
    expect(resolveInstancePickerViewState({ isLoading: false, isError: false, instances })).toEqual(
      {
        kind: 'ready',
        instances,
      }
    );
  });
});