/**
 * Pure "Hide forks" helpers shared by every RepositoryMultiSelect picker
 * (Code Reviewer, Security Agent, Auto Triage). Node-testable: storage is
 * injected so the preference functions run without a DOM.
 *
 * A repo's `fork` flag can be absent from a stale repository cache; only an
 * explicit `fork === true` counts as a known fork.
 */

/** Minimal storage surface the preference functions need (injectable for tests). */
export type HideForksStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const HIDE_FORKS_STORAGE_KEY = 'kilo.repo-picker.hide-forks';

/**
 * When `hideForks` is on, drop only repos with `fork === true`.
 * `undefined` means a stale cache, not a fork — those are kept.
 */
export function filterForks<T extends { fork?: boolean }>(
  repos: readonly T[],
  hideForks: boolean
): T[] {
  return hideForks ? repos.filter(repo => repo.fork !== true) : [...repos];
}

/** True only when at least one repo is a known fork (`fork === true`). */
export function hasKnownForks(repos: readonly { fork?: boolean }[]): boolean {
  return repos.some(repo => repo.fork === true);
}

/**
 * The selection with every id that points at a known fork removed.
 * Selected non-forks are kept; forks that were never selected are irrelevant.
 */
export function pruneSelectedForks<TId extends string | number>(
  selectedIds: readonly TId[],
  repos: readonly { id: string | number; fork?: boolean }[]
): TId[] {
  const forkIds = new Set(repos.filter(repo => repo.fork === true).map(repo => repo.id));
  return selectedIds.filter(id => !forkIds.has(id));
}

/** Only the exact string 'true' turns the preference on; anything else is off. */
export function readHideForksPreference(storage: HideForksStorage): boolean {
  return storage.getItem(HIDE_FORKS_STORAGE_KEY) === 'true';
}

export function writeHideForksPreference(storage: HideForksStorage, value: boolean): void {
  storage.setItem(HIDE_FORKS_STORAGE_KEY, String(value));
}
