import type { WishlineUser } from './wishline-auth.ts';

export function isWishlineAdmin(user: WishlineUser): boolean {
  const configuredIds = parseAdminUserIds(process.env.WISHLINE_ADMIN_USER_IDS);
  return configuredIds.has(user.id);
}

export function parseAdminUserIds(value: string | undefined): Set<string> {
  return new Set((value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 160));
}
