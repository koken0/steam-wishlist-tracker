import { expect, test } from '@playwright/test';
import {
  connectedSetup,
  dashboardFixture,
  disconnectedSetup,
  hasLocalSession,
  signInLocally,
  waitForReact,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/access', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ required: false, unlocked: true }),
  }));
});

test('authenticates, onboards, reconnects, loads the dashboard, and renders safe 429/503 errors', async ({ page }) => {
  let setup = disconnectedSetup();
  let refreshFailure: { status: number; message: string } | null = null;
  const submittedKeys: string[] = [];

  await page.route('**/api/setup', async (route) => {
    if (!hasLocalSession(route)) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } }) });
      return;
    }
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as { appId: string; apiKey: string; projectName: string };
      submittedKeys.push(input.apiKey);
      setup = {
        ...connectedSetup(),
        workspace: {
          ...connectedSetup().workspace,
          appId: Number(input.appId),
          projectName: input.projectName || dashboardFixture.projectName,
        },
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(setup) });
  });

  await page.route('**/api/wishlist', async (route) => {
    if (!hasLocalSession(route)) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } }) });
      return;
    }
    if (route.request().method() === 'POST' && refreshFailure) {
      const failure = refreshFailure;
      refreshFailure = null;
      await route.fulfill({ status: failure.status, contentType: 'application/json', body: JSON.stringify({ error: { code: failure.status === 429 ? 'STEAM_RATE_LIMITED' : 'SERVICE_UNAVAILABLE', message: failure.message } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...dashboardFixture, projectName: setup.workspace.projectName }) });
  });

  await page.goto('/');
  await waitForReact(page);
  await page.getByRole('button', { name: /Continue to demo/ }).click();
  await expect(page.getByText('Account required.')).toBeVisible();
  await page.getByRole('link', { name: /Open local workspace/ }).click();
  await waitForReact(page);
  await expect(page.getByRole('heading', { name: 'Connect your Steam project' })).toBeVisible();

  await page.getByLabel('Steam App ID').fill('1234567');
  await page.getByLabel('Financial API key').fill('acceptance-key-one');
  await page.getByLabel(/Project name/).fill('Acceptance Harbor');
  await page.getByRole('button', { name: /Validate and save securely/ }).click();
  await expect(page.getByRole('heading', { name: 'Ready to track momentum' })).toBeVisible();
  await page.getByRole('button', { name: /Open dashboard/ }).click();

  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  await expect(page.getByText('Acceptance Harbor').first()).toBeVisible();
  await expect(page.getByText('Incomplete coverage')).toBeVisible();
  await expect(page.getByText(/missing 2026-09-04/)).toBeVisible();
  await expect(page.locator('circle title').filter({ hasText: '+0 net' })).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('acceptance-key-one');

  refreshFailure = { status: 429, message: 'Steamworks rate-limited the connector. Wait before refreshing again.' };
  await page.getByRole('button', { name: /Refresh/ }).click();
  await expect(page.getByRole('alert')).toContainText('rate-limited');

  refreshFailure = { status: 503, message: 'Wishlist service is temporarily unavailable.' };
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Milestone target').fill('23456');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Milestone target saved');
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('.milestone-panel')).toContainText('23.5K');
  await page.reload();
  await waitForReact(page);
  await expect(page.locator('.milestone-panel')).toContainText('23.5K');
  await page.getByRole('button', { name: 'Settings' }).click();
  const pushHelpButton = page.getByRole('button', { name: 'Need help?' });
  await expect(pushHelpButton).toHaveAttribute('aria-expanded', 'false');
  await pushHelpButton.click();
  await expect(page.getByRole('note')).toContainText('This does not necessarily mean delivery failed.');
  await expect(page.getByRole('note')).toContainText('Reached this device');
  await expect(page.getByRole('link', { name: /Open Chrome notification help/ })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('button', { name: 'Hide help' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Update Steam connection' }).click();
  await page.getByLabel('Financial API key').fill('acceptance-key-two');
  await page.getByLabel(/Project name/).fill('Acceptance Harbor Reconnected');
  await page.getByRole('button', { name: /Validate and save securely/ }).click();
  await expect(page.getByText('Acceptance Harbor Reconnected').first()).toBeVisible();
  expect(submittedKeys).toEqual(['acceptance-key-one', 'acceptance-key-two']);
  await expect(page.locator('body')).not.toContainText('acceptance-key-two');
});

test('restores a connected owner without flashing the public landing page', async ({ page }) => {
  let releaseSetup!: () => void;
  const setupGate = new Promise<void>((resolve) => { releaseSetup = resolve; });

  await page.context().addCookies([{ name: '__sites_local_auth', value: '1', url: 'http://localhost:3100' }]);
  await page.route('**/api/setup', async (route) => {
    await setupGate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) });
  });
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Identifying you…' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to demo/ })).toHaveCount(0);
  releaseSetup();

  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Your Steam wishlists/ })).toHaveCount(0);
});

test('dashboard remains usable at a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));
  await signInLocally(page);
  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('account deletion requires browser confirmation and returns to the welcome shell', async ({ page }) => {
  let deleteCalls = 0;
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));
  await page.route('**/api/account', async (route) => {
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().headers()['x-wishline-action']).toBe('delete-account');
    deleteCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
  });
  await signInLocally(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Wishline account' }).click();
  await expect(page.getByRole('heading', { name: /Your Steam wishlists/ })).toBeVisible();
  expect(deleteCalls).toBe(1);
});
