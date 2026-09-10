import { expect, test } from '@playwright/test';
import {
  connectedSetup,
  dashboardFixture,
  disconnectedSetup,
  openLocalWorkspace,
  waitForReact,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/access', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ required: false, unlocked: true }),
  }));
  await page.route('**/api/annotations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ annotations: [] }),
  }));
});

test('creates, edits, displays, and deletes a dated timeline note', async ({ page }) => {
  let annotation: { id: string; date: string; note: string; createdAt: string; updatedAt: string } | null = null;
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));
  await page.route('**/api/annotations', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ annotations: annotation ? [annotation] : [] }) });
      return;
    }
    const body = route.request().postDataJSON() as { id?: string; date?: string; note?: string };
    if (method === 'DELETE') annotation = null;
    else annotation = {
      id: annotation?.id || 'annotation_1234567890abcdef1234567890abcdef',
      date: body.date || '', note: body.note || '',
      createdAt: annotation?.createdAt || '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:01:00.000Z',
    };
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(method === 'DELETE' ? { deleted: true } : { annotation }) });
  });

  await openLocalWorkspace(page);
  await page.getByRole('textbox', { name: 'Date' }).fill('2026-09-03');
  await page.getByLabel('What happened?').fill('Launched the demo on Steam');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.locator('.annotation-list')).toContainText('Launched the demo on Steam');
  await expect(page.locator('.annotation-marker')).toHaveCount(1);
  await expect(page.locator('.annotation-marker')).toHaveAttribute('aria-label', /Launched the demo/);
  await expect(page.locator('.annotation-manager .annotation-display-controls')).toHaveCount(1);
  await expect(page.locator('.history-chart .annotation-display-controls')).toHaveCount(0);
  await page.getByRole('button', { name: 'Always visible' }).click();
  await expect(page.locator('.annotation-chart-label')).toContainText('Launched the demo on Steam');
  await page.locator('.history-node').last().click();
  await expect(page.getByRole('textbox', { name: 'Date' })).toHaveValue('2026-09-05');
  await expect(page.getByLabel('What happened?')).toHaveValue('');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('What happened?').fill('Launched the demo and posted on Reddit');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.annotation-list')).toContainText('posted on Reddit');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.annotation-list')).toContainText('No notes yet');
  await expect(page.locator('.annotation-marker')).toHaveCount(0);
});

test('authenticates, onboards, reconnects, loads the dashboard, and renders safe 429/503 errors', async ({ page }) => {
  let setup = disconnectedSetup();
  let refreshFailure: { status: number; message: string } | null = null;
  const submittedKeys: string[] = [];

  await page.route('**/api/setup', async (route) => {
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
  await page.evaluate(() => {
    window.localStorage.setItem('wishline-theme', 'light');
    document.documentElement.dataset.theme = 'light';
  });
  await expect(page.getByRole('heading', { name: 'Connect your Steam project' })).toBeVisible();

  await page.getByLabel('Steam App ID').fill('1234567');
  await page.getByLabel('Financial API key').fill('acceptance-key-one');
  await page.getByLabel(/Project name/).fill('Acceptance Harbor');
  await page.getByRole('button', { name: /Validate and save securely/ }).click();
  await expect(page.getByRole('heading', { name: 'Ready to track momentum' })).toBeVisible();
  await page.getByRole('button', { name: /Open dashboard/ }).click();

  await expect(page.getByText('Stored wishlist total').first()).toBeVisible();
  const darkModeButton = page.getByRole('button', { name: 'Switch color theme' });
  await darkModeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.date-range input').first()).toHaveCSS('background-color', 'rgb(25, 27, 31)');
  await expect(page.locator('.date-range input').first()).toHaveCSS('color', 'rgb(242, 243, 239)');
  await page.reload();
  await waitForReact(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
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
  await expect(page.locator('.about-card')).toContainText('Version 0.0.1');
  await expect(page.getByLabel('Milestone target')).toHaveCSS('background-color', 'rgb(39, 42, 47)');
  await expect(page.getByLabel('Milestone target')).toHaveCSS('color', 'rgb(242, 243, 239)');
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

test('blocks stored data after Steam revokes access and offers reconnection', async ({ page }) => {
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...dashboardFixture,
      syncWarning: {
        code: 'STEAM_ACCESS_DENIED',
        message: 'Steamworks rejected the key, permission, App ID, or IP allowlist.',
      },
    }),
  }));

  await openLocalWorkspace(page);

  const error = page.getByRole('alert');
  await expect(error).toHaveClass(/data-error/);
  await expect(error).toContainText('Steam access revoked');
  await expect(page.getByText('Stored wishlist total')).toHaveCount(0);
  await expect(page.getByText('Latest reported net')).toHaveCount(0);
  await page.evaluate(() => {
    window.localStorage.setItem('wishline-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
  });
  await page.getByRole('button', { name: 'Update Steam connection' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your Steam project' })).toBeVisible();
  await expect(page.getByLabel('Steam App ID')).toHaveValue(String(dashboardFixture.appId));
  await expect(page.locator('.onboarding-header')).toHaveCSS('background-color', 'rgb(32, 35, 40)');
  await expect(page.locator('.setup-card')).toHaveCSS('background-color', 'rgb(32, 35, 40)');
  await expect(page.getByRole('heading', { name: 'Connect your Steam project' })).toHaveCSS('color', 'rgb(242, 243, 239)');
  await expect(page.locator('.connection-form input').first()).toHaveCSS('background-color', 'rgb(25, 27, 31)');
});

test('dashboard remains usable at a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/setup', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(connectedSetup()) }));
  await page.route('**/api/wishlist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture) }));
  await openLocalWorkspace(page);
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
  await openLocalWorkspace(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Wishline account' }).click();
  await expect(page.getByRole('heading', { name: /Your Steam wishlists/ })).toBeVisible();
  expect(deleteCalls).toBe(1);
});
