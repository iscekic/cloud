import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PrReviewReconnectNotice } from '@/components/pr-review/pr-review-reconnect-notice';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  XCircle,
} from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { classifyPrReviewQueryState } from '@/lib/pr-review/classify-pr-review-query-state';
import { type PrOverviewDto } from '@/lib/pr-review/merge/merge-blocked-reasons';
import {
  deriveMergeRequirements,
  type MergeRequirementCheck,
  type MergeRequirementCheckState,
  type MergeRequirementsResult,
} from '@/lib/pr-review/merge/merge-requirements';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';

type PrMergeRequirementsSectionProps = Readonly<{
  owner: string;
  repo: string;
  headSha: string;
  overview: PrOverviewDto;
}>;

// The tone mapping mirrors `classifyCheckTone` (pr-review-checks-section.tsx):
// success -> CheckCircle2/good, failure -> XCircle/destructive, pending ->
// Loader2/mutedForeground, and the "no run yet" state reuses the neutral tone.
type RequirementTone = 'success' | 'failure' | 'pending' | 'neutral';

const CHECK_STATE_TONE = {
  success: 'success',
  failure: 'failure',
  pending: 'pending',
  missing: 'neutral',
} satisfies Record<MergeRequirementCheckState, RequirementTone>;

const CHECK_STATE_LABEL_KEY = {
  success: 'prReview.merge.requirements.passed',
  failure: 'prReview.merge.requirements.failed',
  pending: 'prReview.merge.requirements.pending',
  missing: 'prReview.merge.requirements.noRunYet',
} satisfies Record<MergeRequirementCheckState, string>;

const TONE_ICON = {
  success: CheckCircle2,
  failure: XCircle,
  pending: Loader2,
  neutral: Circle,
} satisfies Record<RequirementTone, typeof CheckCircle2>;

const TONE_ICON_COLOR = {
  success: 'good',
  failure: 'destructive',
  pending: 'mutedForeground',
  neutral: 'mutedForeground',
} satisfies Record<RequirementTone, keyof ReturnType<typeof useThemeColors>>;

const TONE_TEXT_CLASS = {
  success: 'text-good',
  failure: 'text-destructive',
  pending: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
} satisfies Record<RequirementTone, string>;

type NonNullQueueState = Exclude<NonNullable<PrOverviewDto['mergeQueue']>['state'], null>;

// Literal keys, never a template: the catalog check scans the source for the
// keys a lookup passes on, and a computed key is invisible to it.
const QUEUE_STATE_KEY = {
  QUEUED: 'prReview.merge.requirements.queueState.QUEUED',
  AWAITING_CHECKS: 'prReview.merge.requirements.queueState.AWAITING_CHECKS',
  MERGEABLE: 'prReview.merge.requirements.queueState.MERGEABLE',
  UNMERGEABLE: 'prReview.merge.requirements.queueState.UNMERGEABLE',
  LOCKED: 'prReview.merge.requirements.queueState.LOCKED',
} satisfies Record<NonNullQueueState, string>;

function ReviewRequirementRow({
  required,
  satisfied,
}: Readonly<{ required: number; satisfied: number }>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const met = satisfied >= required;
  const Icon = met ? CheckCircle2 : AlertTriangle;
  const iconColor = met ? colors.good : colors.warn;
  const statusText = met
    ? t('prReview.merge.requirements.passed')
    : t('prReview.merge.requirements.notMet');
  return (
    <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
      <Icon size={16} color={iconColor} />
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">
          {t('prReview.merge.requirements.reviews')}
        </Text>
        <Text variant="muted" className="text-xs">
          {t('prReview.merge.requirements.approvals', { satisfied, required })}
        </Text>
      </View>
      <Text className={cn('text-xs font-medium', met ? 'text-good' : 'text-warn')}>
        {statusText}
      </Text>
    </View>
  );
}

function CheckRequirementRow({ check }: Readonly<{ check: MergeRequirementCheck }>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const tone = CHECK_STATE_TONE[check.state];
  const Icon = TONE_ICON[tone];
  const iconColor = colors[TONE_ICON_COLOR[tone]];
  const marker = check.required
    ? t('prReview.merge.requirements.required')
    : t('prReview.merge.requirements.notRequired');
  return (
    <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
      <Icon size={16} color={iconColor} />
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {check.name}
        </Text>
        <Text variant="muted" className="text-xs">
          {marker}
        </Text>
      </View>
      <Text className={cn('text-xs font-medium', TONE_TEXT_CLASS[tone])}>
        {t(CHECK_STATE_LABEL_KEY[check.state])}
      </Text>
    </View>
  );
}

function RequirementsCard({ derived }: Readonly<{ derived: MergeRequirementsResult }>) {
  const { t } = useTranslation();
  if (derived.kind === 'absent') {
    return (
      <View className="rounded-lg bg-secondary p-4">
        <Text className="text-sm text-muted-foreground">
          {t('prReview.merge.requirements.noProtectionRules')}
        </Text>
      </View>
    );
  }
  if (derived.kind === 'unavailable') {
    return (
      <View className="rounded-lg bg-secondary p-4">
        <Text className="text-sm text-muted-foreground">
          {t('prReview.merge.requirements.unavailable')}
        </Text>
      </View>
    );
  }
  return (
    <View className="overflow-hidden rounded-lg bg-secondary">
      {derived.reviewRequired !== null ? (
        <ReviewRequirementRow
          required={derived.reviewRequired}
          satisfied={derived.reviewSatisfied}
        />
      ) : null}
      {derived.checks.map((check, index) => (
        <View key={`${check.required ? 'required' : 'optional'}-${check.name}-${index}`}>
          {index > 0 || derived.reviewRequired !== null ? (
            <View className="ml-4 border-b-[0.5px] border-hair-soft" />
          ) : null}
          <CheckRequirementRow check={check} />
        </View>
      ))}
    </View>
  );
}

function MergeQueueStatus({ queue }: Readonly<{ queue: PrOverviewDto['mergeQueue'] }>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  if (queue === null || !queue.inQueue) {
    return null;
  }
  const positionLine =
    queue.position !== null
      ? t('prReview.merge.requirements.inQueue', { position: queue.position })
      : t('prReview.merge.requirements.positionUnknown');
  const stateLine = queue.state === null ? null : t(QUEUE_STATE_KEY[queue.state]);
  return (
    <View className="gap-2">
      <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
        {t('prReview.merge.requirements.queueTitle')}
      </Text>
      <View className="rounded-lg bg-secondary p-4">
        <View className="flex-row items-center gap-2">
          <Clock3 size={16} color={colors.mutedForeground} />
          <Text className="text-sm font-medium text-foreground">{positionLine}</Text>
        </View>
        {stateLine !== null ? (
          <Text variant="muted" className="text-xs">
            {stateLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PrMergeRequirementsSection({
  owner,
  repo,
  headSha,
  overview,
}: PrMergeRequirementsSectionProps) {
  const trpc = useTRPC();
  const { t } = useTranslation();
  const checks = useQuery(
    trpc.githubPrReview.listChecks.queryOptions({ owner, repo, ref: headSha })
  );
  const errorState = checks.isError ? classifyPrReviewQueryState(checks.error) : null;

  const derived = deriveMergeRequirements({
    requirements: overview.mergeRequirements,
    checkRuns: checks.data?.checkRuns ?? [],
    reviews: overview.reviews,
    requestedReviewers: overview.requestedReviewers,
  });

  let requirementsContent = <RequirementsCard derived={derived} />;
  if (checks.isLoading) {
    requirementsContent = (
      <View className="min-h-11 flex-row items-center gap-3 rounded-lg bg-secondary px-4">
        <View className="h-4 w-4 rounded-full bg-muted" />
        <View className="flex-1 gap-1.5">
          <View className="h-3 w-40 rounded bg-muted" />
          <View className="h-3 w-20 rounded bg-muted" />
        </View>
        <View className="h-3 w-16 rounded bg-muted" />
      </View>
    );
  } else if (errorState?.kind === 'not-found') {
    requirementsContent = (
      <View className="min-h-11 justify-center rounded-lg bg-secondary px-4">
        <Text className="text-sm text-muted-foreground">{t('prReview.checks.notAvailable')}</Text>
      </View>
    );
  } else if (errorState?.kind === 'permission') {
    requirementsContent = (
      <View className="min-h-11 justify-center rounded-lg bg-secondary px-4">
        <Text className="text-sm text-muted-foreground">{t('prReview.checks.noAccess')}</Text>
      </View>
    );
  } else if (errorState?.kind === 'reconnect') {
    requirementsContent = <PrReviewReconnectNotice />;
  } else if (errorState) {
    requirementsContent = (
      <View className="min-h-11 flex-row items-center gap-3 rounded-lg bg-secondary px-4">
        <Text className="flex-1 text-sm text-muted-foreground">
          {t('prReview.checks.couldNotLoad')}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            void checks.refetch();
          }}
          loading={checks.isFetching}
          accessibilityLabel={t('prReview.checks.retryChecks')}
        >
          <Text>{t('common.retry')}</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
        {t('prReview.merge.requirements.title')}
      </Text>
      {requirementsContent}
      <MergeQueueStatus queue={overview.mergeQueue} />
    </View>
  );
}
