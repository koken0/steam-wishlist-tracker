import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const path = new URL('../.env.local', import.meta.url);
let contents = '';
try {
  contents = await readFile(path, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

if (!/^WISHLIST_ENCRYPTION_KEY=.+$/m.test(contents)) {
  const separator = contents && !contents.endsWith('\n') ? '\n' : '';
  contents += `${separator}\n# Local AES-256-GCM wrapping key. Never commit or share this value.\nWISHLIST_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`;
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
  console.log('Created the ignored local Wishline encryption key.');
} else {
  console.log('The ignored local Wishline encryption key is already configured.');
}
