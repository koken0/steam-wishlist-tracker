type WishlistAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 503; code: string; message: string };

export function authorizeWishlistRequest(request: Request): WishlistAccessDecision {
  if (process.env.WISHLIST_DATA_SOURCE !== 'steam') return { allowed: true };

  if (process.env.NODE_ENV !== 'production' && isLoopbackRequest(request)) {
    return { allowed: true };
  }

  const userId = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!userId) {
    return {
      allowed: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Sign in through the private Wishline site to access live Steam data.',
    };
  }

  const allowedUserIds = new Set(
    (process.env.WISHLIST_ALLOWED_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (!allowedUserIds.size) {
    return {
      allowed: false,
      status: 503,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Live production access is disabled until an owner allowlist is configured.',
    };
  }

  if (!allowedUserIds.has(userId)) {
    return {
      allowed: false,
      status: 403,
      code: 'ACCESS_DENIED',
      message: 'This account is not allowed to access the configured Steam project.',
    };
  }

  return { allowed: true };
}

function isLoopbackRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
