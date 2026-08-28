import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('../fixtures/steam-wishlist.sample.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

if (!Number.isInteger(fixture.project?.appId) || !Array.isArray(fixture.records) || fixture.records.length < 7) {
  throw new Error('Fixture must include a project and at least seven wishlist records.');
}

for (const [index, record] of fixture.records.entries()) {
  const response = record?.response;
  const summary = response?.wishlist_summary;
  if (!response?.date || !summary || !Number.isFinite(summary.wishlist_adds) || !Number.isFinite(summary.wishlist_deletes)) {
    throw new Error(`Invalid wishlist fixture record at index ${index}.`);
  }
}

console.log(`Fixture valid: ${fixture.records.length} days for App ID ${fixture.project.appId}.`);
