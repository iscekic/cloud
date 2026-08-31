// Turns the live `child_session_open` timing events into the five-journey,
// before/after report the audit requires. This is a pure report helper: it
// reads measurements and writes a report, so it never runs in app code and
// never changes runtime behavior.
//
// `before` rows hold the baseline (`kwf-bench-base`) timing for a journey and
// `after` rows hold the head timing. `deltaMs` is the per-journey improvement
// `after.tapToFirstContentMs - before.tapToFirstContentMs`, so a negative
// value means the head is faster than the baseline.

export type Journey =
  | 'cold_open'
  | 'warm_reopen'
  | 'return_to_parent'
  | 'many_children'
  | 'slow_network';

export type JourneyTiming = {
  journey: Journey;
  phase: 'fresh' | 'cached';
  tapToFirstContentMs: number;
  networkMs: number;
  storageMs: number;
  renderMs: number;
};

export type JourneyMeasurement = {
  before?: JourneyTiming;
  after?: JourneyTiming;
  siblingFetches?: { before?: number; after?: number };
  /** `after.tapToFirstContentMs - before.tapToFirstContentMs`, set only when both rows exist. */
  deltaMs?: number;
};

export type ChildSessionOpenReport = {
  journeys: Record<Journey, JourneyMeasurement>;
  bottleneck: {
    name: string;
    dominantPhase: 'network' | 'storage' | 'render';
    evidence: string;
  };
};

const ALL_JOURNEYS: Journey[] = [
  'cold_open',
  'warm_reopen',
  'return_to_parent',
  'many_children',
  'slow_network',
];

export function buildChildSessionOpenReport(
  measurements: Partial<Record<Journey, JourneyMeasurement>>
): ChildSessionOpenReport {
  const missing = ALL_JOURNEYS.filter(journey => measurements[journey] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing child-session-open benchmark journeys: ${missing.join(', ')}`);
  }

  const journeys = Object.fromEntries(
    ALL_JOURNEYS.map(journey => [journey, withDelta(requireJourney(measurements, journey))])
  ) as Record<Journey, JourneyMeasurement>;

  const dominantPhase = dominantPhaseAcross(journeys);
  return { journeys, bottleneck: nameBottleneck(journeys, dominantPhase) };
}

function requireJourney(
  measurements: Partial<Record<Journey, JourneyMeasurement>>,
  journey: Journey
): JourneyMeasurement {
  const measurement = measurements[journey];
  if (measurement === undefined) {
    throw new Error(`missing child-session-open benchmark journey: ${journey}`);
  }
  return measurement;
}

function withDelta(measurement: JourneyMeasurement): JourneyMeasurement {
  const { before, after } = measurement;
  if (!before || !after) {
    return measurement;
  }
  return { ...measurement, deltaMs: after.tapToFirstContentMs - before.tapToFirstContentMs };
}

function dominantPhaseAcross(
  journeys: Record<Journey, JourneyMeasurement>
): 'network' | 'storage' | 'render' {
  let networkMs = 0;
  let storageMs = 0;
  let renderMs = 0;
  for (const journey of ALL_JOURNEYS) {
    const after = journeys[journey].after;
    if (after) {
      networkMs += after.networkMs;
      storageMs += after.storageMs;
      renderMs += after.renderMs;
    }
  }
  if (networkMs >= storageMs && networkMs >= renderMs) {
    return 'network';
  }
  if (storageMs >= renderMs) {
    return 'storage';
  }
  return 'render';
}

function nameBottleneck(
  journeys: Record<Journey, JourneyMeasurement>,
  dominantPhase: 'network' | 'storage' | 'render'
): ChildSessionOpenReport['bottleneck'] {
  const many = journeys.many_children;
  const siblingBefore = many.siblingFetches?.before;
  const siblingAfter = many.siblingFetches?.after;
  const after = many.after;

  if (
    siblingBefore !== undefined &&
    siblingAfter !== undefined &&
    after !== undefined &&
    siblingBefore > siblingAfter &&
    after.networkMs > after.renderMs
  ) {
    return {
      name: 'sibling-transcript-prefetch',
      dominantPhase,
      evidence: `many_children siblingFetches before=${siblingBefore} after=${siblingAfter}`,
    };
  }

  return {
    name: 'no-bottleneck',
    dominantPhase,
    evidence: `no sibling-transcript regression; dominant phase is ${dominantPhase}`,
  };
}
