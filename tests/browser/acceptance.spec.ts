import { expect, test } from '@playwright/test';
import {
  connectedSetup,
  dashboardFixture,
  disconnectedSetup,
  hasLocalSession,
  signInLocally,
  waitForReact,
} from './fixtures';

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
  await page.getByRole('button', { name: /Continue to demo/ }).click();
  await expect(page.getByText("Seedy's workspace")).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByLabel('Steam App ID').fill('1234567');
  await page.getByLabel('Financial API key').fill('acceptance-key-one');
  await page.getByLabel(/Project name/).fill('Acceptance Harbor');
  await page.getByRole('button', { name: /Validate and save securely/ }).click();
  await expect(page.getByRole('heading', { name: 'Ready to track momentum' })).toBeVisible();
  await page.getByRole('button', { name: /Open dashboard/ }).click();

  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  await expect(page.getByText('Acceptance Harbor').first()).toBeVisible();
  await expect(page.getByText('Cobertura incompleta')).toBeVisible();
  await expect(page.getByText(/faltan 2026-09-04/)).toBeVisible();
  await expect(page.locator('circle title').filter({ hasText: '+0 net' })).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('acceptance-key-one');

  refreshFailure = { status: 429, message: 'Steamworks rate-limited the connector. Wait before refreshing again.' };
  await page.getByRole('button', { name: /Refresh/ }).click();
  await expect(page.getByRole('alert')).toContainText('rate-limited');

  refreshFailure = { status: 503, message: 'Wishlist service is temporarily unavailable.' };
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Update Steam connection' }).click();
  await page.getByLabel('Financial API key').fill('acceptance-key-two');
  await page.getByLabel(/Project name/).fill('Acceptance Harbor Reconnected');
  await page.getByRole('button', { name: /Validate and save securely/ }).click();
  await expect(page.getByText('Acceptance Harbor Reconnected').first()).toBeVisible();
  expect(submittedKeys).toEqual(['acceptance-key-one', 'acceptance-key-two']);
  await expect(page.locator('body')).not.toContainText('acceptance-key-two');
});

test('dashboard remains usable at a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));
  await signInLocally(page);
  await page.getByRole('button', { name: /Continue to demo/ }).click();
  await page.getByRole('button', { name: /Open dashboard/ }).click();
  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});
