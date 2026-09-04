import { test as setup } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * Authentication setup for E2E tests.
 * Uses the fake-login provider to authenticate a test user.
 * The fakeUser query param triggers automatic form submission and redirect.
 *
 * Uses a unique email per test run to avoid duplicate key constraint violations
 * when the database isn't cleaned between runs.
 *
 * Imports plain @playwright/test: the chromatic test extension wraps every
 * test in a CDP Fetch interception (resource archiving for visual snapshots),
 * which breaks the credentials sign-in POST's session cookie. The setup
 * project captures no visual snapshots, so it does not need the wrapper.
 */
setup('authenticate', async ({ page }) => {
  // Generate a unique email for each test run to avoid duplicate key errors
  const uniqueId = randomUUID().slice(0, 8);
  const testEmail = `test-e2e-${uniqueId}@example.com`;

  // Navigate to sign in page with fakeUser query param to trigger auto-submit
  await page.goto(`/users/sign_in?fakeUser=${encodeURIComponent(testEmail)}`);

  // Wait for navigation to complete - user will end up on survey, profile, or their org.
  // A new fake user first lands on /account-verification: the session is valid
  // at that point, and the screen itself only blocks the onboarding pages, so
  // the saved storage state works for the pages under test.
  await page.waitForURL(
    url =>
      url.pathname === '/customer-source-survey' ||
      url.pathname === '/account-verification' ||
      url.pathname === '/profile' ||
      url.pathname.startsWith('/organizations/'),
    {
      timeout: 20000,
      waitUntil: 'networkidle',
    }
  );

  // If we land on the survey page, skip it to complete setup
  if (new URL(page.url()).pathname === '/customer-source-survey') {
    await page.click('button:has-text("Skip")');
    await page.waitForURL(
      url => url.pathname === '/profile' || url.pathname.startsWith('/organizations/'),
      {
        timeout: 10000,
        waitUntil: 'networkidle',
      }
    );
  }

  // Save the authenticated state (cookies, localStorage, etc.)
  await page.context().storageState({ path: 'playwright/.auth/state.json' });

  const finalUrl = page.url();
  console.log(`Authentication setup complete! Final URL: ${finalUrl}`);
});
