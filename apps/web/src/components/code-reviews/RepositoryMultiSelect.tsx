'use client';

import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Lock, Unlock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeLocalStorage } from '@/lib/localStorage';
import {
  filterForks,
  hasKnownForks,
  pruneSelectedForks,
  readHideForksPreference,
  writeHideForksPreference,
} from '@/lib/repositories/hide-forks';

export type RepositoryId = string | number;

export type Repository<TId extends RepositoryId = number> = {
  id: TId;
  name: string;
  full_name: string;
  private: boolean;
  /** Absent when the repository cache is stale; only `true` counts as a known fork. */
  fork?: boolean;
};

export type RepositoryMultiSelectProps<TId extends RepositoryId = number> = {
  repositories: Repository<TId>[];
  selectedIds: TId[];
  onSelectionChange: (selectedIds: TId[]) => void;
  renderRepositoryAccessory?: (repository: Repository<TId>) => React.ReactNode;
};

export function RepositoryMultiSelect<TId extends RepositoryId = number>({
  repositories,
  selectedIds,
  onSelectionChange,
  renderRepositoryAccessory,
}: RepositoryMultiSelectProps<TId>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hideForks, setHideForks] = useState(false);

  // Init false (SSR-safe) and read the stored preference on the client after
  // mount to avoid a hydration mismatch; the preference is shared by every
  // picker rendered through this component.
  useEffect(() => {
    setHideForks(readHideForksPreference(safeLocalStorage));
  }, []);

  const handleHideForksChange = (value: boolean) => {
    setHideForks(value);
    writeHideForksPreference(safeLocalStorage, value);
  };

  // While hide-forks is on, the selection must never contain fork ids, even
  // when the parent hydrates a saved selection after this picker mounted.
  // Prune whenever the preference, the selection, or the repo list changes so
  // "X of Y" and the saved config stay in sync with the visible list.
  // Un-hiding never re-adds forks.
  useEffect(() => {
    if (!hideForks) return;
    const pruned = pruneSelectedForks(selectedIds, repositories);
    if (pruned.length !== selectedIds.length) onSelectionChange(pruned);
  }, [hideForks, repositories, selectedIds, onSelectionChange]);

  // Hide forks first, then the search filter narrows the remaining repos.
  const visibleRepositories = useMemo(() => {
    const withoutForks = filterForks(repositories, hideForks);
    if (!searchQuery.trim()) return withoutForks;

    const query = searchQuery.toLowerCase();
    return withoutForks.filter(repo => repo.full_name.toLowerCase().includes(query));
  }, [repositories, hideForks, searchQuery]);

  // The toggle is hidden when there is no fork data at all (e.g. Bitbucket),
  // but stays visible while the stored preference is on so it can be switched
  // off again.
  const showHideForksToggle = hideForks || hasKnownForks(repositories);

  const handleToggle = (repoId: TId) => {
    const newSelection = selectedIds.includes(repoId)
      ? selectedIds.filter(id => id !== repoId)
      : [...selectedIds, repoId];

    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    // Replace with exactly the visible ids — what you see is what you get.
    onSelectionChange(visibleRepositories.map(repo => repo.id));
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const isAllSelected =
    visibleRepositories.length > 0 &&
    visibleRepositories.every(repo => selectedIds.includes(repo.id));
  const isNoneSelected = selectedIds.length === 0;
  const showAllForksHidden =
    hideForks && repositories.length > 0 && visibleRepositories.length === 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSelectAll}
          disabled={isAllSelected}
          className="text-xs"
        >
          Select All
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleDeselectAll}
          disabled={isNoneSelected}
          className="text-xs"
        >
          Deselect All
        </Button>
        {showHideForksToggle && (
          <div className="ml-auto flex items-center gap-2">
            <Switch
              id="hide-forks-toggle"
              checked={hideForks}
              onCheckedChange={handleHideForksChange}
            />
            <Label htmlFor="hide-forks-toggle" className="text-xs">
              Hide forks
            </Label>
          </div>
        )}
      </div>

      <div className="border-border bg-background h-64 overflow-y-auto rounded-md border">
        <div className="space-y-3 p-4">
          {visibleRepositories.length === 0 ? (
            searchQuery ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No repositories match your search
              </div>
            ) : showAllForksHidden ? (
              <div className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-center text-sm">
                <span>All {repositories.length} repositories are forks.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleHideForksChange(false)}
                  className="text-xs"
                >
                  Show forks
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No repositories available
              </div>
            )
          ) : (
            visibleRepositories.map(repo => {
              const isChecked = selectedIds.includes(repo.id);

              return (
                <div
                  key={repo.id}
                  className={cn(
                    'hover:bg-accent flex items-center gap-3 rounded-md p-2 transition-colors',
                    isChecked && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Checkbox
                    id={`repo-${repo.id}`}
                    checked={isChecked}
                    onCheckedChange={() => handleToggle(repo.id)}
                  />
                  <label
                    htmlFor={`repo-${repo.id}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm"
                  >
                    {repo.private ? (
                      <Lock className="text-primary h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Unlock className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate font-mono">{repo.full_name}</span>
                    {renderRepositoryAccessory?.(repo)}
                  </label>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-muted-foreground text-xs">
        {selectedIds.length} of {visibleRepositories.length} repositories selected
      </div>
    </div>
  );
}
