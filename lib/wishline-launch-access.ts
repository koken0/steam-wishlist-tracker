const ACCESS_COOKIE = 'wishline_beta_access';
const ACCESS_TOKEN_MESSAGE = 'wishline-beta-access:v1';
const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 12;

export function launchAccessRequired(): boolean {
  return Boolean(process.env.WISHLINE_BETA_PASSWORD?.trim());
}

export async function hasLaunchAccess(request: Request): Promise<boolean> {
  const password = process.env.WISHLINE_BETA_PASSWORD?.trim();
  if (!password) return true;
  const token = readCookie(request.headers.get('cookie'), ACCESS_COOKIE);
  if (!token) return false;
  return constantTimeEqual(token, await accessToken(password));
}

export async function verifyLaunchPassword(candidate: unknown): Promise<boolean> {
  const password = process.env.WISHLINE_BETA_PASSWORD?.trim();
  if (!password || typeof candidate !== 'string' || candidate.length > 256) return false;
  return constantTimeEqual(await digest(candidate), await digest(password));
}

export async function launchAccessCookie(request: Request): Promise<string> {
  const password = process.env.WISHLINE_BETA_PASSWORD?.trim();
  if (!password) throw new Error('Beta access is not configured.');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${ACCESS_COOKIE}=${await accessToken(password)}; Path=/; Max-Age=${ACCESS_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}

async function accessToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ACCESS_TOKEN_MESSAGE));
  return base64Url(new Uint8Array(signature));
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string | Uint8Array, right: string | Uint8Array): boolean {
  const a = typeof left === 'string' ? new TextEncoder().encode(left) : left;
  const b = typeof right === 'string' ? new TextEncoder().encode(right) : right;
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
