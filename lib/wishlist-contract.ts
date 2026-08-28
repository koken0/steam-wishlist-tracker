export type WishlistDataSource = 'fixture' | 'steam';

export type WishlistDay = {
  date: string;
  adds: number;
  deletes: number;
  purchases: number;
  gifts: number;
  addsWindows: number;
  addsMac: number;
  addsLinux: number;
  net: number;
  generatedAt: string | null;
};

export type WishlistDashboardData = {
  source: WishlistDataSource;
  appId: number;
  projectName: string;
  releaseState: string;
  currentWishlists: number | null;
  currentWishlistsAsOf: string | null;
  generatedAt: string | null;
  fetchedAt: string;
  cacheHit: boolean;
  daily: WishlistDay[];
};

export type SteamWishlistSummary = {
  wishlist_adds?: number;
  wishlist_deletes?: number;
  wishlist_purchases?: number;
  wishlist_gifts?: number;
  wishlist_adds_windows?: number;
  wishlist_adds_mac?: number;
  wishlist_adds_linux?: number;
};

export type SteamWishlistResponse = {
  response?: {
    appid?: number;
    date?: string;
    wishlist_summary?: SteamWishlistSummary;
    time_generated?: number;
    app_min_date?: string;
  };
};

export function hasExpectedSteamAppId(payload: SteamWishlistResponse, expectedAppId: number): boolean {
  const response = payload.response;
  if (!response) return true;

  const hasWishlistData = Boolean(response.wishlist_summary);
  if (!hasWishlistData && response.appid === undefined) return true;

  return response.appid === expectedAppId;
}

export function normalizeSteamWishlistResponse(payload: SteamWishlistResponse): WishlistDay | null {
  const response = payload.response;
  if (!response?.date || !response.wishlist_summary) return null;

  const summary = response.wishlist_summary;
  const adds = safeCount(summary.wishlist_adds);
  const deletes = safeCount(summary.wishlist_deletes);

  return {
    date: response.date.replaceAll('/', '-'),
    adds,
    deletes,
    purchases: safeCount(summary.wishlist_purchases),
    gifts: safeCount(summary.wishlist_gifts),
    addsWindows: safeCount(summary.wishlist_adds_windows),
    addsMac: safeCount(summary.wishlist_adds_mac),
    addsLinux: safeCount(summary.wishlist_adds_linux),
    net: adds - deletes,
    generatedAt: response.time_generated
      ? new Date(response.time_generated * 1000).toISOString()
      : null,
  };
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
