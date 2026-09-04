import {
  HIDE_FORKS_STORAGE_KEY,
  filterForks,
  hasKnownForks,
  pruneSelectedForks,
  readHideForksPreference,
  writeHideForksPreference,
  type HideForksStorage,
} from './hide-forks';

function createMemoryStorage(initial: Record<string, string> = {}): HideForksStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('filterForks', () => {
  const repos = [
    { id: 1, fork: false },
    { id: 2, fork: true },
    { id: 3 }, // stale cache: fork unknown
    { id: 4, fork: true },
    { id: 5, fork: false },
  ];

  it('keeps every repo when off, including forks', () => {
    expect(filterForks(repos, false)).toEqual(repos);
  });

  it('drops only fork === true when on', () => {
    expect(filterForks(repos, true).map(repo => repo.id)).toEqual([1, 3, 5]);
  });

  it('keeps undefined-fork repos when on (stale cache is not a fork)', () => {
    expect(filterForks(repos, true)).toContainEqual({ id: 3 });
  });

  it('returns an empty list when every repo is a fork and hideForks is on', () => {
    const allForks = [
      { id: 1, fork: true },
      { id: 2, fork: true },
    ];
    expect(filterForks(allForks, true)).toEqual([]);
    expect(filterForks(allForks, false)).toEqual(allForks);
  });
});

describe('hasKnownForks', () => {
  const withFork = [
    { id: 1, fork: false },
    { id: 2, fork: true },
  ];
  const withoutKnownForks = [
    { id: 1, fork: false },
    { id: 2 }, // stale cache: fork unknown
  ];

  it('is true when some repo has fork === true', () => {
    expect(hasKnownForks(withFork)).toBe(true);
  });

  it('is false when fork is false or undefined on every repo', () => {
    expect(hasKnownForks(withoutKnownForks)).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(hasKnownForks([])).toBe(false);
  });
});

describe('pruneSelectedForks', () => {
  const repos = [
    { id: 1, fork: false },
    { id: 2, fork: true },
    { id: 3 },
    { id: 4, fork: true },
  ];

  it('drops only the selected ids that point at known forks', () => {
    expect(pruneSelectedForks([1, 2, 3, 4], repos)).toEqual([1, 3]);
  });

  it('keeps selected non-forks and ignores forks that were not selected', () => {
    expect(pruneSelectedForks([1, 3], repos)).toEqual([1, 3]);
    expect(pruneSelectedForks([], repos)).toEqual([]);
  });

  it('returns an empty selection when only forks were selected', () => {
    expect(pruneSelectedForks([2, 4], repos)).toEqual([]);
  });
});

describe('hide-forks preference', () => {
  it('round-trips true and false through storage', () => {
    const storage = createMemoryStorage();
    writeHideForksPreference(storage, true);
    expect(readHideForksPreference(storage)).toBe(true);
    writeHideForksPreference(storage, false);
    expect(readHideForksPreference(storage)).toBe(false);
  });

  it('stores the key as the string "true" / "false"', () => {
    const storage = createMemoryStorage();
    writeHideForksPreference(storage, true);
    expect(storage.getItem(HIDE_FORKS_STORAGE_KEY)).toBe('true');
  });

  it('reads a corrupt stored value as off', () => {
    const storage = createMemoryStorage({ [HIDE_FORKS_STORAGE_KEY]: 'yes' });
    expect(readHideForksPreference(storage)).toBe(false);
  });

  it('reads a missing key as off', () => {
    expect(readHideForksPreference(createMemoryStorage())).toBe(false);
  });
});
