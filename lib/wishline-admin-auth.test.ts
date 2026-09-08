import assert from 'node:assert/strict';
import test from 'node:test';
import { isWishlineAdmin, parseAdminUserIds } from './wishline-admin-auth.ts';

test('admin IDs are explicit, trimmed, and empty-safe', () => {
  assert.deepEqual([...parseAdminUserIds(' firebase:one,local-owner, ,firebase:one ')], ['firebase:one', 'local-owner']);
  assert.equal(parseAdminUserIds(undefined).size, 0);
});

test('admin access matches only the authenticated immutable user ID', () => {
  const previous = process.env.WISHLINE_ADMIN_USER_IDS;
  process.env.WISHLINE_ADMIN_USER_IDS = 'firebase:owner-uid';
  try {
    assert.equal(isWishlineAdmin({ id: 'firebase:owner-uid', email: 'owner@example.com', name: 'Owner' }), true);
    assert.equal(isWishlineAdmin({ id: 'firebase:other-uid', email: 'owner@example.com', name: 'Owner' }), false);
  } finally {
    if (previous === undefined) delete process.env.WISHLINE_ADMIN_USER_IDS;
    else process.env.WISHLINE_ADMIN_USER_IDS = previous;
  }
});
