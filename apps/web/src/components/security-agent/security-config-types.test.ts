import { describe, expect, it } from '@jest/globals';
import { toRepositoryOptions } from './security-config-types';
import type { SecurityRepository } from './security-config-types';

const repository = (overrides: Partial<SecurityRepository>): SecurityRepository => ({
  id: 1,
  fullName: 'org/repo',
  name: 'repo',
  private: false,
  dependabotAlerts: 'unknown',
  ...overrides,
});

describe('toRepositoryOptions', () => {
  it('passes fork through to the select options', () => {
    const options = toRepositoryOptions([
      repository({ id: 1, fullName: 'org/fork', name: 'fork', fork: true }),
      repository({ id: 2, fullName: 'org/plain', name: 'plain', fork: false }),
      repository({ id: 3, fullName: 'org/legacy', name: 'legacy' }),
    ]);
    expect(options.map(option => option.fork)).toEqual([true, false, undefined]);
  });
});
