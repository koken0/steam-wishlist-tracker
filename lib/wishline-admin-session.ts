const ADMIN_COOKIE = 'wishline_admin_session';
const ADMIN_SESSION_VERSION = 1;
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type AdminSessionPayload = { v: number; sub: string; exp: number };

export async function hasAdminPageSession(request: Request, now = new Date()): Promise<boolean> {
  const secret = adminSessionSecret();
  if (!secret) return false;
  const token = readCookie(request.headers.get('cookie'), ADMIN_COOKIE);
  if (!token) return false;
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra) return false;
  if (!constantTimeEqual(providedSignature, await sign(encodedPayload, secret))) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AdminSessionPayload;
    return payload.v === ADMIN_SESSION_VERSION
      && typeof payload.sub === 'string'
      && payload.sub.length > 0
      && payload.sub.length <= 160
      && Number.isSafeInteger(payload.exp)
      && payload.exp > Math.floor(now.valueOf() / 1000);
  } catch {
    return false;
  }
}

export async function adminPageSessionCookie(request: Request, userId: string, now = new Date()): Promise<string> {
  const secret = adminSessionSecret();
  if (!secret) throw new Error('Admin page session protection is not configured.');
  const payload: AdminSessionPayload = {
    v: ADMIN_SESSION_VERSION,
    sub: userId,
    exp: Math.floor(now.valueOf() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return serializeCookie(request, `${encodedPayload}.${await sign(encodedPayload, secret)}`, ADMIN_SESSION_MAX_AGE_SECONDS);
}

export function clearAdminPageSessionCookie(request: Request): string {
  return serializeCookie(request, '', 0);
}

function adminSessionSecret(): string | null {
  const secret = process.env.WISHLINE_ADMIN_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function serializeCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

function encodeBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
