import { mkdir, writeFile } from 'node:fs/promises';

const key = process.env.STEAM_FINANCIAL_API_KEY?.trim();
const appId = Number(process.env.STEAM_APP_ID);
const days = Math.min(30, Math.max(1, Number(process.env.STEAM_CAPTURE_DAYS || 7)));

if (!key) throw new Error('STEAM_FINANCIAL_API_KEY is missing from .env.local.');
if (!Number.isInteger(appId) || appId <= 0) throw new Error('STEAM_APP_ID must be a positive integer.');

const today = new Date();
const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
const dates = Array.from({ length: days }, (_, index) => new Date(end - (days - 1 - index) * 86400000).toISOString().slice(0, 10));
const records = [];

for (const date of dates) {
  const url = new URL('https://partner.steam-api.com/IPartnerFinancialsService/GetAppWishlistReporting/v001/');
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('date', date);
  const response = await fetch(url, { headers: { Accept: 'application/json', 'x-webapi-key': key } });
  if (!response.ok) throw new Error(`Steamworks returned HTTP ${response.status} for ${date}.`);
  const payload = await response.json();
  if (payload?.response?.wishlist_summary) {
    records.push({ response: { ...payload.response, appid: 0, country_summary: undefined, language_summary: undefined } });
  }
}

const output = {
  note: 'Sanitized capture: API key, real App ID, country data, and language data are excluded.',
  capturedAt: new Date().toISOString(),
  records,
};

await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
const outputUrl = new URL('../tmp/steam-wishlist-sanitized.json', import.meta.url);
await writeFile(outputUrl, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
console.log(`Captured ${records.length} sanitized records in tmp/steam-wishlist-sanitized.json.`);
