import assert from 'node:assert/strict';
import test from 'node:test';
import { getWishlineUser } from './wishline-auth.ts';
import { workspaceIdForUser } from './wishline-workspace-id.ts';

test('identity comes only from trusted platform headers', () => {
  const withoutHeader = new Request('https://wishline.test/?userId=attacker', {
    method: 'POST',
    body: JSON.stringify({ userId: 'attacker' }),
  });
  assert.equal(getWishlineUser(withoutHeader), null);

  const authenticated = new Request('https://wishline.test/?userId=attacker', {
    headers: {
      'oai-authenticated-user-id': 'owner-a',
      'oai-authenticated-user-email': 'owner@example.test',
    },
  });
  assert.deepEqual(getWishlineUser(authenticated), {
    id: 'owner-a',
    email: 'owner@example.test',
    name: null,
  });
});

test('different authenticated users resolve to isolated workspace IDs', async () => {
  const ownerA = await workspaceIdForUser('owner-a');
  const ownerB = await workspaceIdForUser('owner-b');
  assert.notEqual(ownerA, ownerB);
  assert.equal(ownerA, await workspaceIdForUser('owner-a'));
  assert.match(ownerA, /^ws_[0-9a-f]{24}$/);
});
