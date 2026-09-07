import type { WishlistDay } from './wishlist-contract.ts';

export type WishlistPollClassification =
  | 'initial' | 'unchanged' | 'timestamp_only' | 'counters_changed' | 'empty' | 'error';

export type WishlistPollPrevious = {
  adds: number;
  deletes: number;
  purchases: number;
  gifts: number;
  generated_at: string | null;
};

export type WishlistPollSampleInput = {
  workspaceId: string;
  appId: number;
  requestedDate: string;
  datePhase: 'current' | 'previous';
  fetchedAt: string;
  day?: WishlistDay | null;
  reasonCode?: string | null;
};

export function classifyWishlistPollSample(
  day: WishlistDay | null,
  previous: WishlistPollPrevious | null,
  failed = false,
): WishlistPollClassification {
  if (failed) return 'error';
  if (!day) return 'empty';
  if (!previous) return 'initial';
  if (previous.adds !== day.adds || previous.deletes !== day.deletes
    || previous.purchases !== day.purchases || previous.gifts !== day.gifts) return 'counters_changed';
  return previous.generated_at !== day.generatedAt ? 'timestamp_only' : 'unchanged';
}

export async function saveWishlistPollSampleInDatabase(
  db: D1Database,
  input: WishlistPollSampleInput,
): Promise<WishlistPollClassification> {
  const previous = await db.prepare(
    `SELECT adds, deletes, purchases, gifts, generated_at
       FROM wishlist_poll_samples
      WHERE workspace_id = ? AND app_id = ? AND requested_date = ? AND outcome = 'record'
      ORDER BY fetched_at DESC LIMIT 1`,
  ).bind(input.workspaceId, input.appId, input.requestedDate).first<WishlistPollPrevious>();
  const day = input.day || null;
  const outcome = input.reasonCode ? 'error' : day ? 'record' : 'empty';
  const classification = classifyWishlistPollSample(day, previous, Boolean(input.reasonCode));
  const delta = (value: number, prior: number | undefined) => prior == null ? null : value - prior;
  await db.prepare(
    `INSERT INTO wishlist_poll_samples (
       id, workspace_id, app_id, requested_date, date_phase, outcome, classification, reason_code,
       adds, deletes, purchases, gifts, delta_adds, delta_deletes, delta_purchases, delta_gifts,
       generated_at, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), input.workspaceId, input.appId, input.requestedDate, input.datePhase,
    outcome, classification, input.reasonCode || null,
    day?.adds ?? null, day?.deletes ?? null, day?.purchases ?? null, day?.gifts ?? null,
    day ? delta(day.adds, previous?.adds) : null,
    day ? delta(day.deletes, previous?.deletes) : null,
    day ? delta(day.purchases, previous?.purchases) : null,
    day ? delta(day.gifts, previous?.gifts) : null,
    day?.generatedAt ?? null, input.fetchedAt,
  ).run();
  return classification;
}
