import { dateTimeFormat } from '@/lib/intl-cache';
import { type InstancePickerInstance } from '@/lib/picker-bridge';

export type LabeledInstance = InstancePickerInstance & {
  /**
   * Which picker section the row belongs to. A `kind: 'remote'` instance is a
   * `kilo remote` process and lands under "Remotes"; anything else — an old
   * instance that never reported a `kind`, or an explicit `cli` — is a
   * terminal and lands under "Terminals".
   */
  group: 'remote' | 'terminal';
  /**
   * Human-readable disambiguation facts for the row: the process start time
   * (from `startedAt`) and the branch (falling back to `workingDirectory`),
   * joined with ` · `. `null` when neither part is present, in which case the
   * renderer falls back to `projectName`.
   */
  facts: string | null;
  /**
   * Short, `connectionId`-derived suffix appended to the row's visible label
   * when facts alone cannot disambiguate it from a peer that shares its
   * `(name, projectName)`. `null` when no suffix is needed.
   */
  dedupSuffix: string | null;
};

/** Separator between the two facts parts ("start time · branch"). */
const FACTS_SEPARATOR = ' · ';

/** Start-time options: short, absolute, minute precision. */
const START_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function formatStartTime(startedAt: number, locale: string): string {
  return dateTimeFormat(locale, START_TIME_OPTIONS).format(new Date(startedAt));
}

/** Composes one row's facts: start time, then branch (or working directory). */
function instanceFacts(instance: InstancePickerInstance, locale: string): string | null {
  const parts: string[] = [];
  if (instance.startedAt != null) {
    parts.push(formatStartTime(instance.startedAt, locale));
  }
  const location = instance.branch ?? instance.workingDirectory;
  if (location) {
    parts.push(location);
  }
  return parts.length > 0 ? parts.join(FACTS_SEPARATOR) : null;
}

function pairKey(instance: InstancePickerInstance): string {
  return `${instance.name}\u0000${instance.projectName}`;
}

/**
 * Stamp `shortConnectionIdHash` on the peers that facts cannot tell apart:
 * when every peer has a non-null, pairwise-distinct `facts` value nothing is
 * stamped; otherwise the peers whose facts are missing or collide with a
 * peer's facts get the suffix, while a peer whose facts are present and
 * unique keeps none.
 */
function stampCollidingRows(peers: LabeledInstance[]): void {
  const facts = peers.map(row => row.facts);
  const everyFactPresent = facts.every(fact => fact !== null);
  if (everyFactPresent && new Set(facts).size === facts.length) {
    return;
  }

  const factCounts = new Map<string, number>();
  for (const fact of facts) {
    if (fact !== null) {
      factCounts.set(fact, (factCounts.get(fact) ?? 0) + 1);
    }
  }

  for (const row of peers) {
    const collides = row.facts !== null && (factCounts.get(row.facts) ?? 0) > 1;
    if (row.facts === null || collides) {
      row.dedupSuffix = shortConnectionIdHash(row.connectionId);
    }
  }
}

/**
 * Pure: given a list of instances, return the same list (order preserved)
 * with a `group` per row and a `dedupSuffix` on the rows that facts alone
 * cannot disambiguate.
 *
 * Disambiguation is scoped to peers that share a `(name, projectName)` pair:
 * when every peer has a non-null, pairwise-distinct `facts` value, the facts
 * themselves tell the rows apart and no suffix is stamped. Otherwise each row
 * whose facts are missing or collide with a peer's facts gets the short
 * `connectionId` hash (see `shortConnectionIdHash`), while a peer whose facts
 * are present and unique keeps none.
 *
 * Rows are not re-ordered or de-duplicated; the picker renders one entry per
 * live `connectionId` (an already-disconnected CLI that briefly left a
 * duplicate in the poll before the worker cleans it up must remain visible,
 * not silently collapsed).
 *
 * `locale` drives the start-time formatting so an in-app language override
 * wins over the device's own resolved locale.
 */
export function labelInstances(
  instances: InstancePickerInstance[],
  locale: string
): LabeledInstance[] {
  if (instances.length === 0) {
    return [];
  }

  const labeled: LabeledInstance[] = instances.map(instance => ({
    ...instance,
    group: instance.kind === 'remote' ? 'remote' : 'terminal',
    facts: instanceFacts(instance, locale),
    dedupSuffix: null,
  }));

  const peersByPair = new Map<string, LabeledInstance[]>();
  for (const row of labeled) {
    const key = pairKey(row);
    const peers = peersByPair.get(key);
    if (peers) {
      peers.push(row);
    } else {
      peersByPair.set(key, [row]);
    }
  }

  for (const peers of peersByPair.values()) {
    if (peers.length >= 2) {
      stampCollidingRows(peers);
    }
  }

  return labeled;
}

/**
 * Produce a 6-char hex suffix that:
 *   - is stable for a given `connectionId` (so the same row keeps the same
 *     suffix across polls)
 *   - is short enough to read at a glance
 *   - is derived purely from the connectionId (no UI-side state needed)
 *
 * `globalThis.crypto.subtle` is unavailable on Hermes, so we use a small
 * multiplicative string hash instead (the same pattern as the existing
 * deterministic-hue hash in `@/lib/agent-color.ts#agentColor` — no bitwise
 * operators, repo lint forbids them). The suffix is purely a visual
 * disambiguator, not a cryptographic identifier; this gives more than
 * enough collision resistance for the at-most-a-handful of CLI instances a
 * single user runs.
 */
function shortConnectionIdHash(connectionId: string): string {
  let hash = 0;
  for (let i = 0; i < connectionId.length; i += 1) {
    const codePoint = connectionId.codePointAt(i) ?? 0;
    hash = Math.trunc(hash * 31 + codePoint) % 2_147_483_647;
  }
  return Math.abs(hash).toString(16).padStart(6, '0').slice(0, 6);
}

/**
 * Pure classification of the instance picker's four feature states, per the
 * accepted plan's matrix. Kept separate from `InstancePickerScreen`'s JSX so
 * each state's trigger condition — and its distinctness from its
 * neighbors — is unit-testable without mounting the screen:
 *   - `loading`: the query has never produced data (not the same as a
 *     successful empty response).
 *   - `error`: the query itself failed (retryable — Retry CTA). Distinct
 *     from `empty`, which is a *successful* zero-instance response.
 *   - `ready`: a successful response, `instances` may be an empty array
 *     (the caller renders the Refresh-CTA empty card in that case) or
 *     populated (rows + Check for the selected one).
 */
type InstancePickerViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; instances: InstancePickerInstance[] };

export function resolveInstancePickerViewState(input: {
  isLoading: boolean;
  isError: boolean;
  instances: InstancePickerInstance[];
}): InstancePickerViewState {
  if (input.isLoading) {
    return { kind: 'loading' };
  }
  if (input.isError) {
    return { kind: 'error' };
  }
  return { kind: 'ready', instances: input.instances };
}
