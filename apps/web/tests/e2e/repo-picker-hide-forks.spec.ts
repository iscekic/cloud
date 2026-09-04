import { expect, test, type Page } from '@playwright/test';
import { HIDE_FORKS_STORAGE_KEY } from '@/lib/repositories/hide-forks';
/**
 * Live-browser regression for the shared "Hide forks" toggle in
 * RepositoryMultiSelect (Code Reviewer, Auto Triage, Security Agent).
 *
 * tRPC v11 runs without a data transformer, so batch responses are plain JSON
 * arrays of `{ result: { data } }`. Every tRPC request is fetched for real and
 * only the target procedures' payload entries are replaced, so the page keeps
 * its real session, layout, and all other queries.
 */
const ARTIFACTS_DIR = 'tests/e2e/artifacts/hide-forks';
const LAST_SYNCED_AT = new Date('2026-08-01T12:00:00Z').toISOString();
const PRIMARY_DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
type FixtureRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  fork: boolean;
};
/** Fixture A: 2 normal repositories + 2 forks. */
const REPOS_MIXED: FixtureRepository[] = [
  { id: 101, name: 'web', fullName: 'acme/web', private: false, fork: false },
  { id: 102, name: 'api', fullName: 'acme/api', private: true, fork: false },
  { id: 103, name: 'tool', fullName: 'acme/forked-tool', private: false, fork: true },
  { id: 104, name: 'docs', fullName: 'acme/forked-docs', private: false, fork: true },
];
/** Fixture B: every repository is a fork. */
const REPOS_ALL_FORKS: FixtureRepository[] = [
  { id: 201, name: 'first', fullName: 'acme/first-fork', private: false, fork: true },
  { id: 202, name: 'second', fullName: 'acme/second-fork', private: false, fork: true },
  { id: 203, name: 'third', fullName: 'acme/third-fork', private: false, fork: true },
  { id: 204, name: 'fourth', fullName: 'acme/fourth-fork', private: false, fork: true },
];
// Shape copied from the default branch of personalReviewAgent.getReviewConfig
// (apps/web/src/routers/code-reviews-router.ts), flipped to enabled + selected
// so the picker renders without mutating anything.
const CODE_REVIEW_CONFIG = {
  isEnabled: true,
  reviewStyle: 'balanced' as const,
  focusAreas: [],
  customInstructions: null,
  modelSlug: PRIMARY_DEFAULT_MODEL,
  thinkingEffort: null,
  gateThreshold: 'off' as const,
  repositorySelectionMode: 'selected' as const,
  selectedRepositoryIds: [],
  manuallyAddedRepositories: [],
  repositoryModelOverrides: [],
  council: null,
  councilEnabledRepositoryIds: [],
  disableReviewMd: true,
  skipBotPullRequests: true,
  reviewMemoryEnabled: false,
  actionRequired: null,
};
// Shape copied from DEFAULT_AUTO_TRIAGE_CONFIG plus the shared-handler response
// envelope, flipped to enabled + selected.
const AUTO_TRIAGE_CONFIG = {
  isEnabled: true,
  enabled_for_issues: true,
  repository_selection_mode: 'selected' as const,
  selected_repository_ids: [],
  skip_labels: [],
  required_labels: [],
  duplicate_threshold: 0.8,
  auto_fix_threshold: 0.8,
  auto_create_pr_threshold: 0.8,
  max_concurrent_per_owner: 10,
  custom_instructions: null,
  model_slug: PRIMARY_DEFAULT_MODEL,
  max_classification_time_minutes: 5,
  max_pr_creation_time_minutes: 15,
};
// Shape copied from the securityAgent.getConfig handler
// (apps/web/src/lib/security-agent/router/shared-handlers.ts), flipped to
// enabled + selected.
const SECURITY_CONFIG = {
  hasConfig: true,
  configRevision: 1,
  isEnabled: true,
  slaCriticalDays: 15,
  slaHighDays: 30,
  slaMediumDays: 45,
  slaLowDays: 90,
  slaEnabled: true,
  autoSyncEnabled: true,
  repositorySelectionMode: 'selected' as const,
  selectedRepositoryIds: [],
  modelSlug: 'kilo-auto/balanced',
  triageModelSlug: 'kilo-auto/balanced',
  analysisModelSlug: 'kilo-auto/balanced',
  analysisMode: 'auto' as const,
  autoDismissEnabled: false,
  autoDismissConfidenceThreshold: 'high' as const,
  autoAnalysisEnabled: false,
  autoAnalysisMinSeverity: 'high' as const,
  autoAnalysisIncludeExisting: false,
  autoRemediationEnabled: false,
  autoRemediationMinSeverity: 'high' as const,
  autoRemediationIncludeExisting: false,
  autoRemediationRequireApproval: true,
  autoRemediationEnabledAt: null,
  remediationModelSlug: 'kilo-auto/balanced',
  slaNotificationsEnabled: false,
  slaNotificationMinSeverity: 'high' as const,
  slaNotificationWarningDays: 3,
  newFindingNotificationsEnabled: false,
  newFindingNotificationMinSeverity: 'high' as const,
};
const SECURITY_PERMISSION_STATUS = {
  hasIntegration: true,
  integrationId: 'integration-security-agent-e2e',
  hasPermissions: true,
  reauthorizeUrl: null,
  authInvalidAt: null,
  authInvalidReason: null,
};
const repositoriesPayload = (repositories: FixtureRepository[]) => ({
  integrationInstalled: true,
  repositories,
  syncedAt: LAST_SYNCED_AT,
});
// securityAgent.getRepositories returns a bare array with Dependabot status.
const securityRepositoriesPayload = (repositories: FixtureRepository[]) =>
  repositories.map(repository => ({
    id: repository.id,
    fullName: repository.fullName,
    name: repository.name,
    private: repository.private,
    fork: repository.fork,
    dependabotAlerts: 'unknown' as const,
  }));
type TrpcDataOverrides = Record<string, unknown>;
/**
 * Intercepts tRPC batch GETs, fetches the real response, and replaces the
 * payload entries for the stubbed procedures. Unstubbed procedures keep the
 * real backend's data.
 */
async function stubTrpcProcedures(page: Page, overrides: TrpcDataOverrides) {
  await page.route('**/api/trpc/**', async route => {
    const url = new URL(route.request().url());
    const procedures = (url.pathname.split('/api/trpc/')[1] ?? '')
      .split(',')
      .map(name => name.trim());
    const upstream = await route.fetch();
    const payload: unknown = await upstream.json();
    const replace = (entry: unknown, procedure: string | undefined) => {
      const data = procedure === undefined ? undefined : overrides[procedure];
      if (data === undefined) return entry;
      if (entry && typeof entry === 'object' && 'result' in entry) {
        const withResult = entry as { result: Record<string, unknown> };
        return { ...withResult, result: { ...withResult.result, data } };
      }
      return entry;
    };
    const patched = Array.isArray(payload)
      ? payload.map((entry, index) => replace(entry, procedures[index]))
      : replace(payload, procedures[0]);
    await route.fulfill({
      status: upstream.status(),
      contentType: upstream.headers()['content-type'] ?? 'application/json',
      body: JSON.stringify(patched),
    });
  });
}
const hideForksSwitch = (page: Page) => page.getByRole('switch', { name: 'Hide forks' });
const listBox = (page: Page) => page.locator('div.h-64.overflow-y-auto');
const rowCheckbox = (page: Page, repository: FixtureRepository) =>
  page.locator(`#repo-${repository.id}`);
const footer = (page: Page, text: string) => page.getByText(text, { exact: true });
const capture = (page: Page, name: string) =>
  page.screenshot({ path: `${ARTIFACTS_DIR}/${name}.png`, fullPage: true });
async function openPickerPage(page: Page, path: string) {
  await page.goto(path, { timeout: 120_000, waitUntil: 'networkidle' });
}
// PR evidence: every scenario is captured as a screenshot, plus a video.
test.use({ video: 'on' });

test.describe('hide-forks repository picker', () => {
  test.setTimeout(180_000);
  for (const path of ['/code-reviews', '/auto-triage'] as const) {
    const pageLabel = path === '/code-reviews' ? 'code-reviewer' : 'auto-triage';
    test(`default off: all rows visible with the toggle unchecked on ${pageLabel}`, async ({
      page,
    }) => {
      await stubTrpcProcedures(page, {
        'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
        'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
        'personalAutoTriage.getAutoTriageConfig': AUTO_TRIAGE_CONFIG,
        'personalAutoTriage.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
      });
      await openPickerPage(page, path);
      const hideForks = hideForksSwitch(page);
      await expect(hideForks).toBeVisible();
      await expect(hideForks).not.toBeChecked();
      for (const repository of REPOS_MIXED) {
        await expect(page.getByText(repository.fullName)).toBeVisible();
      }
      await expect(footer(page, '0 of 4 repositories selected')).toBeVisible();
      await capture(page, `01-default-off-${pageLabel}`);
    });
    test(`toggle on: forks hidden, preference persisted on ${pageLabel}`, async ({ page }) => {
      await stubTrpcProcedures(page, {
        'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
        'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
        'personalAutoTriage.getAutoTriageConfig': AUTO_TRIAGE_CONFIG,
        'personalAutoTriage.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
      });
      await openPickerPage(page, path);
      await hideForksSwitch(page).click();
      await expect(hideForksSwitch(page)).toBeChecked();
      for (const repository of REPOS_MIXED.filter(repository => repository.fork)) {
        await expect(page.getByText(repository.fullName)).toBeHidden();
      }
      for (const repository of REPOS_MIXED.filter(repository => !repository.fork)) {
        await expect(page.getByText(repository.fullName)).toBeVisible();
      }
      await expect(footer(page, '0 of 2 repositories selected')).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), HIDE_FORKS_STORAGE_KEY)).toBe(
        'true'
      );
      await capture(page, `02-toggle-on-${pageLabel}`);
      // Persistence: the preference survives a reload.
      await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
      await expect(hideForksSwitch(page)).toBeChecked();
      for (const repository of REPOS_MIXED.filter(repository => repository.fork)) {
        await expect(page.getByText(repository.fullName)).toBeHidden();
      }
      for (const repository of REPOS_MIXED.filter(repository => !repository.fork)) {
        await expect(page.getByText(repository.fullName)).toBeVisible();
      }
      await expect(footer(page, '0 of 2 repositories selected')).toBeVisible();
      await capture(page, `03-persisted-reload-${pageLabel}`);
    });
    test(`list box height is stable across toggling on ${pageLabel}`, async ({ page }) => {
      await stubTrpcProcedures(page, {
        'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
        'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
        'personalAutoTriage.getAutoTriageConfig': AUTO_TRIAGE_CONFIG,
        'personalAutoTriage.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
      });
      await openPickerPage(page, path);
      await expect(page.getByText('acme/web')).toBeVisible();
      const list = listBox(page);
      await expect(list).toHaveCount(1);
      const before = await list.boundingBox();
      expect(before).not.toBeNull();
      await hideForksSwitch(page).click();
      await expect(footer(page, '0 of 2 repositories selected')).toBeVisible();
      const after = await list.boundingBox();
      expect(after?.height).toBe(before?.height);
      await capture(page, `07-layout-stable-${pageLabel}`);
    });
  }
  test('all-forks list offers Show forks from the empty state', async ({ page }) => {
    await stubTrpcProcedures(page, {
      'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
      'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_ALL_FORKS),
      'personalAutoTriage.getAutoTriageConfig': AUTO_TRIAGE_CONFIG,
      'personalAutoTriage.listGitHubRepositories': repositoriesPayload(REPOS_ALL_FORKS),
    });
    await page.addInitScript(key => localStorage.setItem(key, 'true'), HIDE_FORKS_STORAGE_KEY);
    await openPickerPage(page, '/code-reviews');
    await expect(page.getByText('All 4 repositories are forks.')).toBeVisible();
    const showForks = page.getByRole('button', { name: 'Show forks' });
    await expect(showForks).toBeVisible();
    await expect(footer(page, '0 of 0 repositories selected')).toBeVisible();
    await capture(page, '04-all-forks-empty');
    await showForks.click();
    await expect(hideForksSwitch(page)).not.toBeChecked();
    for (const repository of REPOS_ALL_FORKS) {
      await expect(page.getByText(repository.fullName)).toBeVisible();
    }
    await expect(footer(page, '0 of 4 repositories selected')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), HIDE_FORKS_STORAGE_KEY)).toBe(
      'false'
    );
    await capture(page, '04-all-forks-shown');
  });
  test('search combines with hide-forks', async ({ page }) => {
    await stubTrpcProcedures(page, {
      'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
      'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
    });
    await openPickerPage(page, '/code-reviews');
    await hideForksSwitch(page).click();
    await expect(footer(page, '0 of 2 repositories selected')).toBeVisible();
    const search = page.getByPlaceholder('Search repositories...');
    await search.fill('forked');
    await expect(page.getByText('No repositories match your search')).toBeVisible();
    await capture(page, '05-search-fork-only');
    await search.fill('web');
    await expect(page.getByText('No repositories match your search')).toBeHidden();
    await expect(page.getByText('acme/web')).toBeVisible();
    await expect(page.getByText('acme/api')).toBeHidden();
    await expect(footer(page, '0 of 1 repositories selected')).toBeVisible();
    await capture(page, '05-search-normal-repo');
  });
  test('Select All while forks are hidden keeps forks unselected after unhide', async ({
    page,
  }) => {
    await stubTrpcProcedures(page, {
      'personalReviewAgent.getReviewConfig': CODE_REVIEW_CONFIG,
      'personalReviewAgent.listGitHubRepositories': repositoriesPayload(REPOS_MIXED),
    });
    await openPickerPage(page, '/code-reviews');
    await hideForksSwitch(page).click();
    await expect(footer(page, '0 of 2 repositories selected')).toBeVisible();
    await page.getByRole('button', { name: 'Select All', exact: true }).click();
    await expect(footer(page, '2 of 2 repositories selected')).toBeVisible();
    await expect(rowCheckbox(page, REPOS_MIXED[0])).toBeChecked();
    await expect(rowCheckbox(page, REPOS_MIXED[1])).toBeChecked();
    await expect(rowCheckbox(page, REPOS_MIXED[2])).toHaveCount(0);
    await expect(rowCheckbox(page, REPOS_MIXED[3])).toHaveCount(0);
    await capture(page, '06-select-all-hidden');
    await hideForksSwitch(page).click();
    for (const repository of REPOS_MIXED) {
      await expect(page.getByText(repository.fullName)).toBeVisible();
    }
    await expect(rowCheckbox(page, REPOS_MIXED[0])).toBeChecked();
    await expect(rowCheckbox(page, REPOS_MIXED[1])).toBeChecked();
    await expect(rowCheckbox(page, REPOS_MIXED[2])).not.toBeChecked();
    await expect(rowCheckbox(page, REPOS_MIXED[3])).not.toBeChecked();
    await expect(footer(page, '2 of 4 repositories selected')).toBeVisible();
    await capture(page, '06-unhide-forks-unchecked');
  });
  // Advisory: the Security Agent config page renders the same shared picker.
  test('security agent config shows the same toggle (advisory)', async ({ page }) => {
    await stubTrpcProcedures(page, {
      'securityAgent.getPermissionStatus': SECURITY_PERMISSION_STATUS,
      'securityAgent.getConfig': SECURITY_CONFIG,
      'securityAgent.getRepositories': securityRepositoriesPayload(REPOS_MIXED),
    });
    await openPickerPage(page, '/security-agent/config');
    await expect(hideForksSwitch(page)).toBeVisible();
    await expect(page.getByText('acme/forked-tool')).toBeVisible();
    await capture(page, '08-security-agent-picker');
  });
});
