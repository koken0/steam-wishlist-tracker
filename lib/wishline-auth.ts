import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

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
  const localUser = localSitesUser(request);
  if (localUser) return localUser;

  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (firebaseProjectId) {
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

  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!id) return null;

  return {
    id,
    email: cleanClaim(request.headers.get('oai-authenticated-user-email')),
    name: cleanClaim(request.headers.get('oai-authenticated-user-name')),
  };
}

function localSitesUser(request: Request): WishlineUser | null {
  if (process.env.NODE_ENV !== 'development') return null;

  let hostname: string;
  try {
    hostname = new URL(request.url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return null;

  if (request.headers.get('oai-authenticated-user-id')?.trim() !== 'local_seedy') return null;

  return {
    id: 'local_seedy',
    email: cleanClaim(request.headers.get('oai-authenticated-user-email')),
    name: cleanClaim(request.headers.get('oai-authenticated-user-full-name')),
  };
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
