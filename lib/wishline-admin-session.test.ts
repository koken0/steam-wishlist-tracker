import assert from 'node:assert/strict';
import test from 'node:test';
import { adminPageSessionCookie, clearAdminPageSessionCookie, hasAdminPageSession } from './wishline-admin-session.ts';

const mutableEnv = process.env as unknown as Record<string, string | undefined>;

test('admin page sessions are HttpOnly, signed, expiring, and tamper resistant', async () => {
  const previous = process.env.WISHLINE_ADMIN_SESSION_SECRET;
  mutableEnv.WISHLINE_ADMIN_SESSION_SECRET = 'admin-session-test-secret-at-least-32-chars';
  try {
    const now = new Date('2026-09-09T12:00:00.000Z');
    const request = new Request('https://wishline.example/admin');
    const setCookie = await adminPageSessionCookie(request, 'firebase:admin-uid', now);
    assert.match(setCookie, /Path=\/admin; Max-Age=28800; HttpOnly; SameSite=Strict; Secure/);
    const cookie = setCookie.split(';', 1)[0];
    assert.equal(await hasAdminPageSession(new Request(request, { headers: { cookie } }), new Date('2026-09-09T19:59:59.000Z')), true);
    assert.equal(await hasAdminPageSession(new Request(request, { headers: { cookie: `${cookie}tampered` } }), now), false);
    assert.equal(await hasAdminPageSession(new Request(request, { headers: { cookie } }), new Date('2026-09-09T20:00:01.000Z')), false);
    assert.match(clearAdminPageSessionCookie(request), /wishline_admin_session=; Path=\/admin; Max-Age=0/);
  } finally {
    if (previous === undefined) delete mutableEnv.WISHLINE_ADMIN_SESSION_SECRET;
    else mutableEnv.WISHLINE_ADMIN_SESSION_SECRET = previous;
  }
});

test('admin page sessions fail closed without a strong configured secret', async () => {
  const previous = process.env.WISHLINE_ADMIN_SESSION_SECRET;
  delete mutableEnv.WISHLINE_ADMIN_SESSION_SECRET;
  try {
    await assert.rejects(() => adminPageSessionCookie(new Request('https://wishline.example/admin'), 'firebase:admin'));
    assert.equal(await hasAdminPageSession(new Request('https://wishline.example/admin')), false);
    mutableEnv.WISHLINE_ADMIN_SESSION_SECRET = 'too-short';
    assert.equal(await hasAdminPageSession(new Request('https://wishline.example/admin')), false);
  } finally {
    if (previous === undefined) delete mutableEnv.WISHLINE_ADMIN_SESSION_SECRET;
    else mutableEnv.WISHLINE_ADMIN_SESSION_SECRET = previous;
  }
});
