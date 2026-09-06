import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasLaunchAccess,
  launchAccessCookie,
  launchAccessRequired,
  verifyLaunchPassword,
} from './wishline-launch-access.ts';

test('beta access is disabled when no temporary password is configured', async () => {
  const original = process.env.WISHLINE_BETA_PASSWORD;
  delete process.env.WISHLINE_BETA_PASSWORD;
  assert.equal(launchAccessRequired(), false);
  assert.equal(await hasLaunchAccess(new Request('https://wishline.test')), true);
  if (original === undefined) delete process.env.WISHLINE_BETA_PASSWORD;
  else process.env.WISHLINE_BETA_PASSWORD = original;
});

test('beta access accepts the configured password and issues a protected cookie', async () => {
  const original = process.env.WISHLINE_BETA_PASSWORD;
  process.env.WISHLINE_BETA_PASSWORD = 'temporary-private-beta-password';
  assert.equal(await verifyLaunchPassword('wrong-password'), false);
  assert.equal(await verifyLaunchPassword('temporary-private-beta-password'), true);
  const request = new Request('https://wishline.test/api/access');
  const cookie = await launchAccessCookie(request);
  assert.match(cookie, /^wishline_beta_access=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(await hasLaunchAccess(new Request('https://wishline.test/api/setup', {
    headers: { cookie: cookie.split(';')[0] },
  })), true);
  assert.equal(await hasLaunchAccess(new Request('https://wishline.test/api/setup', {
    headers: { cookie: 'wishline_beta_access=forged' },
  })), false);
  if (original === undefined) delete process.env.WISHLINE_BETA_PASSWORD;
  else process.env.WISHLINE_BETA_PASSWORD = original;
});
