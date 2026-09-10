import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const secret = randomBytes(48).toString('base64url');
const result = spawnSync('npx', ['wrangler', 'secret', 'put', 'WISHLINE_ADMIN_SESSION_SECRET'], {
  cwd: new URL('..', import.meta.url),
  input: `${secret}\n`,
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Configured the deployed admin page-session secret without writing or printing its value.');
