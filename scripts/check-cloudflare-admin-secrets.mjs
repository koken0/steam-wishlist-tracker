import { spawnSync } from 'node:child_process';

const required = ['WISHLINE_ADMIN_USER_IDS', 'WISHLINE_ADMIN_SESSION_SECRET'];
const result = spawnSync('npx', ['wrangler', 'secret', 'list', '--format', 'json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

let configured;
try {
  const entries = JSON.parse(result.stdout);
  configured = new Set(entries.map((entry) => entry.name));
} catch {
  console.error('Could not read the Cloudflare secret inventory.');
  process.exit(1);
}

const missing = required.filter((name) => !configured.has(name));
if (missing.length) {
  console.error(`Deployment blocked: configure these Worker secrets first: ${missing.join(', ')}`);
  console.error('Use `npm run setup:cloudflare:admin-session` for the generated session secret and `npx wrangler secret put WISHLINE_ADMIN_USER_IDS` for the administrator allowlist.');
  process.exit(1);
}

console.log('Cloudflare admin secrets are configured.');
