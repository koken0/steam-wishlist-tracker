import {
  hasExpectedSteamAppId,
  normalizeSteamWishlistResponse,
  type SteamWishlistResponse,
  type WishlistDay,
} from './wishlist-contract.ts';
import { WishlistConnectorError } from './wishlist-errors.ts';

const STEAM_ENDPOINT = 'https://partner.steam-api.com/IPartnerFinancialsService/GetAppWishlistReporting/v001/';
const MAX_RATE_LIMIT_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;

export async function fetchSteamWishlistDate(
  key: string,
  appId: number,
  date: string,
  fetchImpl: typeof fetch = fetch,
  sleepImpl: (delayMs: number) => Promise<void> = sleep,
): Promise<SteamWishlistResponse> {
  const url = new URL(STEAM_ENDPOINT);
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('date', date);

  let response: Response | null = null;
  for (let attempt = 1; attempt <= MAX_RATE_LIMIT_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'x-webapi-key': key },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new WishlistConnectorError('STEAM_UNREACHABLE', 'The server could not reach the Steamworks partner API.', 502);
    }
    if (response.status !== 429 || attempt === MAX_RATE_LIMIT_ATTEMPTS) break;
    await sleepImpl(retryDelayMs(response, attempt));
  }

  if (!response) {
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
    throw new WishlistConnectorError('STEAM_APP_MISMATCH', 'Steamworks returned wishlist data for an unexpected App ID.', 502);
  }
  return payload;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, retryAfterSeconds * 1_000);
  }
  return Math.min(MAX_RETRY_DELAY_MS, 750 * (2 ** (attempt - 1)));
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function requireUsableWishlistDays(payloads: SteamWishlistResponse[]): WishlistDay[] {
  const daily = payloads
    .map(normalizeSteamWishlistResponse)
    .filter((record): record is WishlistDay => Boolean(record))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!daily.length) {
    throw new WishlistConnectorError(
      'NO_WISHLIST_DATA',
      'Steam accepted the request but returned no usable wishlist records for the configured period.',
      502,
    );
  }
  return daily;
}
