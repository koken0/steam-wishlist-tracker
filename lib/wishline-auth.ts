import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { hasLaunchAccess } from './wishline-launch-access.ts';

export type WishlineUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type FirebaseClaims = {
  sub: string;
  email?: unknown;
  name?: unknown;
  auth_time: number;
};

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export async function getWishlineUser(request: Request): Promise<WishlineUser | null> {
  if (!await hasLaunchAccess(request)) return null;
  return getWishlineAuthenticatedUser(request);
}

export async function getWishlineAuthenticatedUser(request: Request): Promise<WishlineUser | null> {
  if (isLocalDevelopmentRequest(request)) {
    return { id: 'local:owner', email: null, name: 'Local owner' };
  }

  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!firebaseProjectId) return null;
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return null;

  try {
    const claims = await verifyFirebaseIdToken(token, firebaseProjectId);
    return {
      id: `firebase:${claims.sub}`,
      email: cleanClaim(claims.email),
      name: cleanClaim(claims.name),
    };
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  key: JWTVerifyGetKey = FIREBASE_JWKS,
): Promise<FirebaseClaims> {
  if (!token || token.length > 8192) throw new Error('Invalid Firebase ID token.');

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128) throw new Error('Invalid Firebase subject.');
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now) {
    throw new Error('Invalid Firebase authentication time.');
  }

  return payload as FirebaseClaims;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function cleanClaim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, 254) : null;
}

function isLocalDevelopmentRequest(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
