import { type inferRouterOutputs, type MobileRouter } from '@kilocode/trpc/mobile';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ExternalLink } from '@/components/ui/icons';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { i18n } from '@/i18n';
import { openExternalUrl } from '@/lib/external-link';
import { formatDate } from '@/lib/format';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import {
  type DerivedReviewDecision,
  deriveReviewDecisions,
  type ReviewAuthor,
  type ReviewDecision,
} from '@/lib/pr-review/review-decisions';
import { parseTimestamp, timeAgo } from '@/lib/utils';

type RouterOutputs = inferRouterOutputs<MobileRouter>;
type PrOverview = RouterOutputs['githubPrReview']['getPullRequest'];
type LinkedIssue = PrOverview['linkedIssues'][number];

type PrReviewContextSectionProps = {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly overview: PrOverview;
};

const DECISION_LABEL_KEY = {
  approved: 'prReview.context.approved',
  changesRequested: 'prReview.context.changesRequested',
  commented: 'prReview.context.commented',
  dismissed: 'prReview.context.dismissed',
  awaiting: 'prReview.context.awaiting',
} satisfies Record<ReviewDecision['kind'], string>;

const ISSUE_STATE_LABEL_KEY = {
  OPEN: 'prReview.context.issueOpen',
  CLOSED: 'prReview.context.issueClosed',
} satisfies Record<LinkedIssue['state'], string>;

function formatContextDate(iso: string): string {
  // Hermes rejects dateStyle/timeStyle mixed with timeZoneName.
  return formatDate(parseTimestamp(iso), i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function BlockTitle({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function AuthorRow({ author }: Readonly<{ author: ReviewAuthor | null }>) {
  const { t } = useTranslation();
  if (!author) {
    return (
      <View className="flex-row items-center gap-2">
        <View className="size-6 rounded-full bg-muted" />
        <Text variant="muted" className="text-sm">
          {t('prReview.context.unknownAuthor')}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      {author.avatarUrl ? (
        <Image
          source={{ uri: author.avatarUrl }}
          className="size-6 rounded-full"
          transition={0}
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="size-6 rounded-full bg-muted" />
      )}
      <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
        {author.login}
      </Text>
    </View>
  );
}

function LabelChip({ name, color }: Readonly<{ name: string; color: string | null }>) {
  const colors = useThemeColors();
  const dotColor = color ? `#${color}` : colors.mutedForeground;
  return (
    <View className="flex-row items-center gap-1.5 self-start rounded-full bg-secondary px-2.5 py-1">
      {/* eslint-disable-next-line react-native/no-inline-styles -- dynamic per-label hex color */}
      <View className="size-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <Text className="text-xs font-medium text-foreground">{name}</Text>
    </View>
  );
}

function ReviewerRow({ decision }: Readonly<{ decision: DerivedReviewDecision }>) {
  const { t } = useTranslation();
  if (decision.kind === 'team') {
    return (
      <View className="flex-row items-center gap-2">
        <View className="size-6 rounded-full bg-muted" />
        <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
          {decision.name}
        </Text>
        <Text variant="muted" className="text-xs">
          {t('prReview.context.team')}
        </Text>
      </View>
    );
  }
  const submission = decision.decision;
  return (
    <View className="flex-row items-center justify-between gap-3">
      <AuthorRow author={{ login: decision.login, avatarUrl: decision.avatarUrl }} />
      <View className="items-end gap-0.5">
        <Text className="text-sm text-foreground">{t(DECISION_LABEL_KEY[submission.kind])}</Text>
        {submission.kind !== 'awaiting' && submission.submittedAt !== null ? (
          <>
            <Text className="text-sm text-foreground">{formatContextDate(submission.submittedAt)}</Text>
            <Text variant="muted" className="text-xs">
              {timeAgo(parseTimestamp(submission.submittedAt))}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function DateRow({ label, iso }: Readonly<{ label: string; iso: string }>) {
  const date = parseTimestamp(iso);
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="muted" className="text-sm">
        {label}
      </Text>
      <View className="flex-1 items-end gap-0.5">
        <Text className="text-sm text-foreground">{formatContextDate(iso)}</Text>
        <Text variant="muted" className="text-xs">
          {timeAgo(date)}
        </Text>
      </View>
    </View>
  );
}

function LinkedIssueRow({ issue }: Readonly<{ issue: LinkedIssue }>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Pressable
      className="active:opacity-70"
      onPress={() => {
        void openExternalUrl(issue.url, { label: t('prReview.context.linkedIssues') });
      }}
      accessibilityRole="link"
      accessibilityLabel={t('prReview.context.linkedIssueA11y', {
        number: issue.number,
        title: issue.title,
      })}
    >
      <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
        <Text variant="mono" className="text-sm text-muted-foreground">
          {`#${issue.number}`}
        </Text>
        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
          {issue.title}
        </Text>
        <Text variant="muted" className="text-xs">
          {t(ISSUE_STATE_LABEL_KEY[issue.state])}
        </Text>
        <ExternalLink size={14} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

function reviewerKey(decision: DerivedReviewDecision): string {
  return decision.kind === 'team' ? `team:${decision.slug}` : `user:${decision.login}`;
}

export function PrReviewContextSection({
  owner: _owner,
  repo: _repo,
  number: _number,
  overview,
}: PrReviewContextSectionProps) {
  const { t } = useTranslation();
  const decisions = deriveReviewDecisions(
    overview.reviews,
    overview.requestedReviewers,
    overview.requestedTeams
  );

  return (
    <View className="gap-4">
      <Text variant="eyebrow" className="uppercase tracking-wide text-muted-foreground">
        {t('prReview.context.title')}
      </Text>

      {overview.labels.length > 0 ? (
        <View className="gap-2">
          <BlockTitle>{t('prReview.context.labels')}</BlockTitle>
          <View className="flex-row flex-wrap gap-2">
            {overview.labels.map(label => (
              <LabelChip key={label.name} name={label.name} color={label.color} />
            ))}
          </View>
        </View>
      ) : null}

      {overview.assignees.length > 0 ? (
        <View className="gap-2">
          <BlockTitle>{t('prReview.context.assignees')}</BlockTitle>
          <View className="gap-2">
            {overview.assignees.map(assignee => (
              <AuthorRow key={assignee.login} author={assignee} />
            ))}
          </View>
        </View>
      ) : null}

      {decisions.length > 0 ? (
        <View className="gap-2">
          <BlockTitle>{t('prReview.context.reviewers')}</BlockTitle>
          <View className="gap-2">
            {decisions.map(decision => (
              <ReviewerRow key={reviewerKey(decision)} decision={decision} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <DateRow label={t('prReview.context.opened')} iso={overview.createdAt} />
        <DateRow label={t('prReview.context.updated')} iso={overview.updatedAt} />
        {overview.closedAt !== null ? (
          <DateRow label={t('prReview.context.closed')} iso={overview.closedAt} />
        ) : null}
        {overview.mergedAt !== null ? (
          <DateRow label={t('prReview.context.merged')} iso={overview.mergedAt} />
        ) : null}
      </View>

      {overview.mergedBy !== null ? (
        <View className="gap-2">
          <BlockTitle>{t('prReview.context.mergedBy')}</BlockTitle>
          <AuthorRow author={overview.mergedBy} />
        </View>
      ) : null}

      {overview.linkedIssues.length > 0 ? (
        <View className="gap-2">
          <BlockTitle>{t('prReview.context.linkedIssues')}</BlockTitle>
          <View className="overflow-hidden rounded-lg bg-secondary">
            {overview.linkedIssues.map((issue, index) => (
              <View key={issue.number}>
                <LinkedIssueRow issue={issue} />
                {index < overview.linkedIssues.length - 1 ? (
                  <View className="ml-4 border-b-[0.5px] border-hair-soft" />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
