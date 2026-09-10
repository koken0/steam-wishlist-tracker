import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const path = new URL('../.env.local', import.meta.url);
let contents = '';
try {
  contents = await readFile(path, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

let changed = false;
if (!/^WISHLIST_ENCRYPTION_KEY=.+$/m.test(contents)) {
  const separator = contents && !contents.endsWith('\n') ? '\n' : '';
  contents += `${separator}\n# Local AES-256-GCM wrapping key. Never commit or share this value.\nWISHLIST_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`;
  changed = true;
  console.log('Created the ignored local Wishline encryption key.');
} else {
  console.log('The ignored local Wishline encryption key is already configured.');
}

if (!/^WISHLINE_ADMIN_SESSION_SECRET=.{32,}$/m.test(contents)) {
  const separator = contents && !contents.endsWith('\n') ? '\n' : '';
  contents += `${separator}\n# Local admin page-session signing secret. Never commit or share this value.\nWISHLINE_ADMIN_SESSION_SECRET=${randomBytes(32).toString('base64url')}\n`;
  changed = true;
  console.log('Created the ignored local admin session secret.');
} else {
  console.log('The ignored local admin session secret is already configured.');
}

if (!/^WISHLINE_ADMIN_USER_IDS=.+$/m.test(contents)) {
  const separator = contents && !contents.endsWith('\n') ? '\n' : '';
  contents += `${separator}\n# Fixed loopback-only administrator used by local development.\nWISHLINE_ADMIN_USER_IDS=local:owner\n`;
  changed = true;
  console.log('Configured the loopback-only local administrator.');
} else {
  console.log('The local admin allowlist is already configured.');
}

if (changed) {
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
}
