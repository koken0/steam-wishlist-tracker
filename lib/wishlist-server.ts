import fixture from '@/fixtures/steam-wishlist.sample.json';
import {
  classifyWishlistFreshness,
  storedWishlistTotal,
  type WishlistDashboardData,
  type WishlistDay,
} from '@/lib/wishlist-contract';
import {
  readWishlistHistory,
  saveWishlistHistory,
} from '@/lib/wishlist-history-store';
import { WishlistConnectorError } from '@/lib/wishlist-errors';
import { fetchSteamWishlistDate, requireUsableWishlistDays } from '@/lib/wishlist-steam-client';

const STEAM_STORE_ENDPOINT = 'https://store.steampowered.com/api/appdetails';
const MIN_FORCE_REFRESH_MS = 60_000;

type SteamStoreAppDetailsResponse = Record<
  string,
  { success?: boolean; data?: { name?: unknown } }
>;

type CacheEntry = { key: string; expiresAt: number; fetchedAtMs: number; data: WishlistDashboardData };
let cache: CacheEntry | null = null;

export type SteamConnection = {
  apiKey: string;
  appId: number;
  projectName?: string;
  cacheScope?: string;
  useEnvironmentMetadata?: boolean;
};

export { WishlistConnectorError } from '@/lib/wishlist-errors';

export async function getWishlistDashboardData(
  force = false,
  connection?: SteamConnection,
): Promise<WishlistDashboardData> {
  const source = connection || process.env.WISHLIST_DATA_SOURCE === 'steam' ? 'steam' : 'fixture';
  const cacheSeconds = clampInteger(process.env.STEAM_CACHE_SECONDS, 1800, 60, 86400);
  const appId = connection?.appId ?? (source === 'steam' ? requireAppId() : fixture.project.appId);
  const cacheKey = `${source}:${connection?.cacheScope || 'environment'}:${appId}`;
  const now = Date.now();

  if (cache?.key === cacheKey) {
    const forceIsTooSoon = force && now - cache.fetchedAtMs < MIN_FORCE_REFRESH_MS;
    if (cache.expiresAt > now || forceIsTooSoon) {
      return { ...cache.data, cacheHit: true };
    }
  }

  const data = source === 'steam' ? await loadSteamData({
    apiKey: connection?.apiKey ?? requireSteamKey(),
    appId,
    projectName: connection?.projectName,
    cacheScope: connection?.cacheScope,
    useEnvironmentMetadata: connection ? connection.useEnvironmentMetadata : true,
  }) : loadFixtureData();
  cache = { key: cacheKey, expiresAt: now + cacheSeconds * 1000, fetchedAtMs: now, data };
  return data;
}

function loadFixtureData(): WishlistDashboardData {
  const daily = fixture.records
    .map((record) => requireUsableWishlistDays([record])[0]);

  return {
    source: 'fixture',
    appId: fixture.project.appId,
    projectName: fixture.project.name,
    releaseState: fixture.project.releaseState,
    currentWishlists: storedWishlistTotal(daily),
    currentWishlistsAsOf: daily.at(-1)?.date ? `${daily.at(-1)?.date}T00:00:00.000Z` : null,
    totalKind: daily.length ? 'stored' : 'unavailable',
    coverageStart: daily.at(0)?.date || null,
    coverageEnd: daily.at(-1)?.date || null,
    coverageComplete: false,
    generatedAt: latestGeneratedAt(daily),
    fetchedAt: new Date().toISOString(),
    freshness: classifyWishlistFreshness(latestGeneratedAt(daily), new Date().toISOString()),
    cacheHit: false,
    syncWarning: null,
    daily,
  };
}

async function loadSteamData(connection: SteamConnection): Promise<WishlistDashboardData> {
  const { apiKey: key, appId } = connection;
  const lookbackDays = clampInteger(process.env.STEAM_LOOKBACK_DAYS, 30, 1, 90);
  const dates = utcDatesEndingToday(lookbackDays);
  const fetchedAt = new Date().toISOString();
  let storeProjectName: string | null = null;

  try {
    const [payloads, fetchedProjectName] = await Promise.all([
      mapWithConcurrency(dates, 4, (date) => fetchSteamWishlistDate(key, appId, date)),
      fetchSteamProjectName(appId),
    ]);
    storeProjectName = fetchedProjectName;
    const fetchedDaily = requireUsableWishlistDays(payloads);

    if (connection.cacheScope) {
      await saveWishlistHistory(connection.cacheScope, appId, fetchedDaily, fetchedAt);
      const history = await readWishlistHistory(connection.cacheScope, appId);
      return buildSteamDashboard(connection, history.daily, history.fetchedAt || fetchedAt, storeProjectName, null);
    }

    return buildSteamDashboard(connection, fetchedDaily, fetchedAt, storeProjectName, null);
  } catch (error) {
    if (!connection.cacheScope) throw error;
    const history = await readWishlistHistory(connection.cacheScope, appId);
    if (!history.daily.length || !history.fetchedAt) throw error;
    const connectorError = error instanceof WishlistConnectorError
      ? error
      : new WishlistConnectorError('HISTORY_WRITE_FAILED', 'Wishline could not update its stored wishlist history.', 500);
    return buildSteamDashboard(
      connection,
      history.daily,
      history.fetchedAt,
      null,
      { code: connectorError.code, message: `${connectorError.message} Showing the last stored data.` },
    );
  }
}

function buildSteamDashboard(
  connection: SteamConnection,
  daily: WishlistDay[],
  fetchedAt: string,
  storeProjectName: string | null,
  syncWarning: { code: string; message: string } | null,
): WishlistDashboardData {
  const coverageStart = daily.at(0)?.date || null;
  const coverageEnd = daily.at(-1)?.date || null;
  const currentWishlists = storedWishlistTotal(daily);
  const currentWishlistsAsOf = coverageEnd ? `${coverageEnd}T00:00:00.000Z` : null;
  const generatedAt = latestGeneratedAt(daily);

  return {
    source: 'steam',
    appId: connection.appId,
    projectName: connection.projectName?.trim()
      || (connection.useEnvironmentMetadata ? process.env.STEAM_PROJECT_NAME?.trim() : '')
      || storeProjectName
      || `Steam App ${connection.appId}`,
    releaseState: 'Steamworks project',
    currentWishlists,
    currentWishlistsAsOf,
    totalKind: currentWishlists == null ? 'unavailable' : 'stored',
    coverageStart,
    coverageEnd,
    coverageComplete: false,
    generatedAt,
    fetchedAt,
    freshness: classifyWishlistFreshness(generatedAt, fetchedAt),
    cacheHit: false,
    syncWarning,
    daily,
  };
}

export async function validateSteamConnection(connection: SteamConnection): Promise<{ projectName: string; records: number }> {
  const dates = utcDatesEndingToday(Math.min(7, clampInteger(process.env.STEAM_LOOKBACK_DAYS, 7, 1, 90)));
  const [payloads, storeProjectName] = await Promise.all([
    mapWithConcurrency(dates, 3, (date) => fetchSteamWishlistDate(connection.apiKey, connection.appId, date)),
    fetchSteamProjectName(connection.appId),
  ]);
  const records = requireUsableWishlistDays(payloads).length;
  return {
    projectName: connection.projectName?.trim() || storeProjectName || `Steam App ${connection.appId}`,
    records,
  };
}

async function fetchSteamProjectName(appId: number): Promise<string | null> {
  const url = new URL(STEAM_STORE_ENDPOINT);
  url.searchParams.set('appids', String(appId));
  url.searchParams.set('l', 'english');

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as SteamStoreAppDetailsResponse;
    const app = payload[String(appId)];
    const name = app?.success ? app.data?.name : null;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    // Store metadata is optional; wishlist reporting should still work if it is unavailable.
    return null;
  }
}

function requireAppId(): number {
  const value = Number(process.env.STEAM_APP_ID);
  if (!Number.isInteger(value) || value <= 0) {
    throw new WishlistConnectorError('INVALID_APP_ID', 'Live mode requires a positive numeric STEAM_APP_ID.', 503);
  }
  return value;
}

function requireSteamKey(): string {
  const key = process.env.STEAM_FINANCIAL_API_KEY?.trim();
  if (!key) {
    throw new WishlistConnectorError('MISSING_STEAM_KEY', 'Live mode is enabled, but the server has no Steam Financial API key.', 503);
  }
  return key;
}

function utcDatesEndingToday(days: number): string[] {
  const today = new Date();
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: days }, (_, index) => new Date(end - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function latestGeneratedAt(daily: WishlistDay[]): string | null {
  return daily.map((day) => day.generatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function clampInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
