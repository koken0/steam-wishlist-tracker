import type { Page, Route } from '@playwright/test';

export type BrowserSetup = {
  user: { email: string; name: string };
  workspace: {
    workspaceId: string;
    workspaceName: string;
    appId: number | null;
    projectName: string | null;
    connected: boolean;
    updatedAt: string | null;
  };
};

export const dashboardFixture = {
  source: 'steam',
  appId: 1234567,
  projectName: 'Acceptance Harbor',
  releaseState: 'Steamworks project',
  currentWishlists: 42,
  currentWishlistsAsOf: '2026-09-05T00:00:00.000Z',
  totalKind: 'stored',
  coverageStart: '2026-09-03',
  coverageEnd: '2026-09-05',
  coverageComplete: false,
  generatedAt: '2026-09-05T07:00:00.000Z',
  fetchedAt: '2026-09-05T07:01:00.000Z',
  freshness: 'fresh',
  cacheHit: false,
  syncWarning: null,
  alerts: [],
  daily: [
    day('2026-09-03', 12, 2),
    day('2026-09-04', 18, 3),
    day('2026-09-05', 20, 3),
  ],
} as const;

export function disconnectedSetup(): BrowserSetup {
  return {
    user: { email: 'seedy@sites.test', name: 'Seedy' },
    workspace: {
      workspaceId: 'ws_acceptance',
      workspaceName: "Seedy's workspace",
      appId: null,
      projectName: null,
      connected: false,
      updatedAt: null,
    },
  };
}

export function connectedSetup(): BrowserSetup {
  return {
    ...disconnectedSetup(),
    workspace: {
      ...disconnectedSetup().workspace,
      appId: dashboardFixture.appId,
      projectName: dashboardFixture.projectName,
      connected: true,
      updatedAt: '2026-09-05T07:01:00.000Z',
    },
  };
}

export function hasLocalSession(route: Route): boolean {
  return (route.request().headers().cookie || '')
    .split(';')
    .some((cookie) => cookie.trim() === '__sites_local_auth=1');
}

export async function signInLocally(page: Page): Promise<void> {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await page.waitForURL('/');
  await waitForReact(page);
}

export async function waitForReact(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector('button');
    return Boolean(button && Object.keys(button).some((key) => key.startsWith('__reactProps')));
  });
}

function day(date: string, adds: number, deletes: number) {
  return {
    date,
    adds,
    deletes,
    purchases: 1,
    gifts: 0,
    addsWindows: adds,
    addsMac: 0,
    addsLinux: 0,
    net: adds - deletes,
    generatedAt: `${date}T07:00:00.000Z`,
  };
}
