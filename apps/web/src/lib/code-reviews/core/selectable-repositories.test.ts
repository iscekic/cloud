import { describe, expect, it } from '@jest/globals';
import {
  buildAllowedRepositoryFullNames,
  buildSelectableRepositories,
} from './selectable-repositories';

const fetched = [{ id: 1, name: 'a', fullName: 'org/a', private: false }];
const manual = [
  // Duplicate of a fetched repo (by id) — dropped so it isn't listed twice.
  { id: 1, name: 'a', full_name: 'org/a', private: false },
  { id: 2, name: 'b', full_name: 'org/b', private: true },
];

describe('buildSelectableRepositories', () => {
  it('maps fetched repos and appends only non-duplicate manual entries', () => {
    const result = buildSelectableRepositories(fetched, manual);
    expect(result.map(repo => repo.full_name)).toEqual(['org/a', 'org/b']);
  });

  it('keeps fork: true on a fetched fork', () => {
    const result = buildSelectableRepositories(
      [{ id: 3, name: 'fork', fullName: 'org/fork', private: false, fork: true }],
      []
    );
    expect(result.map(repo => repo.fork)).toEqual([true]);
  });

  it('keeps fork: false on a fetched non-fork', () => {
    const result = buildSelectableRepositories(
      [{ id: 4, name: 'plain', fullName: 'org/plain', private: true, fork: false }],
      []
    );
    expect(result.map(repo => repo.fork)).toEqual([false]);
  });

  it('yields undefined fork for fork-less legacy manual entries', () => {
    const result = buildSelectableRepositories(
      [],
      [{ id: 5, name: 'legacy', full_name: 'org/legacy', private: true }]
    );
    expect(result.map(repo => repo.fork)).toEqual([undefined]);
  });
});

describe('buildAllowedRepositoryFullNames', () => {
  it('returns the deduped set of allowed full names', () => {
    const allowed = buildAllowedRepositoryFullNames(fetched, manual);
    expect(allowed.has('org/a')).toBe(true);
    expect(allowed.has('org/b')).toBe(true);
    expect(allowed.has('org/not-listed')).toBe(false);
    expect(allowed.size).toBe(2);
  });
});
