import { expect, test } from '@playwright/test';

test('is install-ready, keeps private API data out of caches, and serves the offline shell', async ({ context, page }) => {
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');
  const manifest = await page.evaluate(async () => fetch('/manifest.webmanifest').then((response) => response.json())) as {
    name: string;
    display: string;
    start_url: string;
    icons: Array<{ sizes: string }>;
  };
  expect(manifest).toMatchObject({ name: 'Wishline — Steam Wishlist Momentum', display: 'standalone', start_url: '/' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' }),
  ]));

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => fetch('/api/wishlist', { cache: 'no-store' }));

  const cachedPrivateRequests = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()))).flat();
    return requests.filter((request) => new URL(request.url).pathname.startsWith('/api/')).map((request) => request.url);
  });
  expect(cachedPrivateRequests).toEqual([]);

  await context.setOffline(true);
  const offlineApiResult = await page.evaluate(async () => {
    try {
      await fetch('/api/wishlist', { cache: 'no-store' });
      return 'unexpected-response';
    } catch {
      return 'network-rejected';
    }
  });
  expect(offlineApiResult).toBe('network-rejected');

  await page.reload();
  await expect(page.getByRole('heading', { name: /Your Steam wishlists/ })).toBeVisible();
});
