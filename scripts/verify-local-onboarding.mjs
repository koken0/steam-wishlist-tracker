const baseUrl = process.env.WISHLINE_TEST_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.STEAM_FINANCIAL_API_KEY?.trim();
const appId = Number(process.env.STEAM_APP_ID);

if (!apiKey || !Number.isInteger(appId) || appId <= 0) {
  throw new Error('STEAM_FINANCIAL_API_KEY and STEAM_APP_ID are required in the ignored .env.local file.');
}

const signInResponse = await fetch(`${baseUrl}/signin-with-chatgpt?return_to=/`, { redirect: 'manual' });
const cookie = signInResponse.headers.getSetCookie?.().map((value) => value.split(';', 1)[0]).join('; ')
  || signInResponse.headers.get('set-cookie')?.split(';', 1)[0]
  || '';
if (!cookie) throw new Error('The local Sites sign-in route did not create a test session.');

const identityHeaders = { Cookie: cookie };

const setupResponse = await fetch(`${baseUrl}/api/setup`, {
  method: 'POST',
  headers: { ...identityHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId,
    apiKey,
    projectName: process.env.STEAM_PROJECT_NAME?.trim() || '',
  }),
});
const setup = await setupResponse.json();
if (!setupResponse.ok) throw new Error(`Setup failed: ${setup?.error?.message || setupResponse.status}`);

const dashboardResponse = await fetch(`${baseUrl}/api/wishlist`, {
  headers: identityHeaders,
});
const dashboard = await dashboardResponse.json();
if (!dashboardResponse.ok) throw new Error(`Dashboard failed: ${dashboard?.error?.message || dashboardResponse.status}`);

if (JSON.stringify(setup).includes(apiKey) || JSON.stringify(dashboard).includes(apiKey)) {
  throw new Error('A client response exposed the Steam API key.');
}

console.log(JSON.stringify({
  account: setup.user?.email,
  workspace: setup.workspace?.workspaceName,
  connected: setup.workspace?.connected,
  appId: dashboard.appId,
  projectName: dashboard.projectName,
  source: dashboard.source,
  records: dashboard.daily?.length,
  keyExposed: false,
}, null, 2));
