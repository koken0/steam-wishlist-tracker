import fixture from '@/fixtures/steam-wishlist.sample.json';
import {
  hasExpectedSteamAppId,
  normalizeSteamWishlistResponse,
  type SteamWishlistResponse,
  type WishlistDashboardData,
  type WishlistDay,
} from '@/lib/wishlist-contract';

const STEAM_ENDPOINT = 'https://partner.steam-api.com/IPartnerFinancialsService/GetAppWishlistReporting/v001/';
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

export class WishlistConnectorError extends Error {
  constructor(public code: string, message: string, public status = 500) {
    super(message);
  }
}

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
    .map((record) => normalizeSteamWishlistResponse(record as SteamWishlistResponse))
    .filter((record): record is WishlistDay => Boolean(record));

  return {
    source: 'fixture',
    appId: fixture.project.appId,
    projectName: fixture.project.name,
    releaseState: fixture.project.releaseState,
    currentWishlists: fixture.project.currentWishlistTotal,
    currentWishlistsAsOf: fixture.project.currentWishlistTotalAsOf,
    generatedAt: latestGeneratedAt(daily),
    fetchedAt: new Date().toISOString(),
    cacheHit: false,
    daily,
  };
}

async function loadSteamData(connection: SteamConnection): Promise<WishlistDashboardData> {
  const { apiKey: key, appId } = connection;
  const lookbackDays = clampInteger(process.env.STEAM_LOOKBACK_DAYS, 30, 1, 90);
  const dates = utcDatesEndingToday(lookbackDays);
  const [payloads, storeProjectName] = await Promise.all([
    mapWithConcurrency(dates, 4, (date) => fetchSteamDate(key, appId, date)),
    fetchSteamProjectName(appId),
  ]);
  const daily = payloads
    .map(normalizeSteamWishlistResponse)
    .filter((record): record is WishlistDay => Boolean(record))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!daily.length) {
    throw new WishlistConnectorError('NO_WISHLIST_DATA', 'Steam accepted the request but returned no wishlist records for the configured period.', 502);
  }

  return {
    source: 'steam',
    appId,
    projectName: connection.projectName?.trim()
      || (connection.useEnvironmentMetadata ? process.env.STEAM_PROJECT_NAME?.trim() : '')
      || storeProjectName
      || `Steam App ${appId}`,
    releaseState: 'Steamworks project',
    currentWishlists: connection.useEnvironmentMetadata
      ? optionalNonNegativeInteger(process.env.STEAM_CURRENT_WISHLIST_TOTAL)
      : null,
    currentWishlistsAsOf: connection.useEnvironmentMetadata
      ? optionalIsoDate(process.env.STEAM_CURRENT_WISHLIST_TOTAL_AS_OF)
      : null,
    generatedAt: latestGeneratedAt(daily),
    fetchedAt: new Date().toISOString(),
    cacheHit: false,
    daily,
  };
}

export async function validateSteamConnection(connection: SteamConnection): Promise<{ projectName: string; records: number }> {
  const dates = utcDatesEndingToday(Math.min(7, clampInteger(process.env.STEAM_LOOKBACK_DAYS, 7, 1, 90)));
  const [payloads, storeProjectName] = await Promise.all([
    mapWithConcurrency(dates, 3, (date) => fetchSteamDate(connection.apiKey, connection.appId, date)),
    fetchSteamProjectName(connection.appId),
  ]);
  const records = payloads.map(normalizeSteamWishlistResponse).filter(Boolean).length;
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

async function fetchSteamDate(key: string, appId: number, date: string): Promise<SteamWishlistResponse> {
  const url = new URL(STEAM_ENDPOINT);
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('date', date);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'x-webapi-key': key },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new WishlistConnectorError('STEAM_UNREACHABLE', 'The server could not reach the Steamworks partner API.', 502);
  }

  if (response.status === 401 || response.status === 403) {
    throw new WishlistConnectorError('STEAM_ACCESS_DENIED', 'Steamworks rejected the key, permission, App ID, or IP allowlist.', 502);
  }
  if (response.status === 429) {
    throw new WishlistConnectorError('STEAM_RATE_LIMITED', 'Steamworks rate-limited the connector. Wait before refreshing again.', 429);
  }
  if (!response.ok) {
    throw new WishlistConnectorError('STEAM_ERROR', `Steamworks returned HTTP ${response.status}.`, 502);
  }

  let payload: SteamWishlistResponse;
  try {
    payload = (await response.json()) as SteamWishlistResponse;
  } catch {
    throw new WishlistConnectorError('INVALID_STEAM_RESPONSE', 'Steamworks returned a response that was not valid JSON.', 502);
  }

  if (!hasExpectedSteamAppId(payload, appId)) {
    throw new WishlistConnectorError(
      'STEAM_APP_MISMATCH',
      'Steamworks returned wishlist data for an unexpected App ID.',
      502,
    );
  }
  return payload;
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

function optionalNonNegativeInteger(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function optionalIsoDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
