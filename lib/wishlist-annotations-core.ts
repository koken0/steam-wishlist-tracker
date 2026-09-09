import { WishlistConnectorError } from './wishlist-errors.ts';

export type WishlistAnnotation = {
  id: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type AnnotationRow = {
  id: string;
  report_date: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export function createWishlistAnnotationStore(db: D1Database) {
  async function list(workspaceId: string, appId: number): Promise<WishlistAnnotation[]> {
    const result = await db.prepare(
      `SELECT id, report_date, note, created_at, updated_at
         FROM wishlist_annotations
        WHERE workspace_id = ? AND app_id = ? ORDER BY report_date DESC`,
    ).bind(workspaceId, appId).all<AnnotationRow>();
    return (result.results || []).map(publicAnnotation);
  }

  async function create(workspaceId: string, appId: number, input: unknown): Promise<WishlistAnnotation> {
    const value = annotationInput(input);
    const now = new Date().toISOString();
    const id = `annotation_${crypto.randomUUID().replaceAll('-', '')}`;
    try {
      await db.prepare(
        `INSERT INTO wishlist_annotations (id, workspace_id, app_id, report_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, workspaceId, appId, value.date, value.note, now, now).run();
    } catch (error) {
      if (String(error).includes('UNIQUE')) {
        throw new WishlistConnectorError('ANNOTATION_DATE_EXISTS', 'This date already has a note. Edit it instead.', 409);
      }
      throw error;
    }
    return { id, date: value.date, note: value.note, createdAt: now, updatedAt: now };
  }

  async function update(workspaceId: string, appId: number, input: unknown): Promise<WishlistAnnotation> {
    const value = annotationInput(input, true);
    const now = new Date().toISOString();
    try {
      const result = await db.prepare(
        `UPDATE wishlist_annotations SET report_date = ?, note = ?, updated_at = ?
          WHERE id = ? AND workspace_id = ? AND app_id = ?`,
      ).bind(value.date, value.note, now, value.id, workspaceId, appId).run();
      if (!result.meta.changes) throw new WishlistConnectorError('ANNOTATION_NOT_FOUND', 'The note was not found.', 404);
    } catch (error) {
      if (error instanceof WishlistConnectorError) throw error;
      if (String(error).includes('UNIQUE')) {
        throw new WishlistConnectorError('ANNOTATION_DATE_EXISTS', 'This date already has a note.', 409);
      }
      throw error;
    }
    const row = await db.prepare(
      `SELECT id, report_date, note, created_at, updated_at FROM wishlist_annotations
        WHERE id = ? AND workspace_id = ? AND app_id = ?`,
    ).bind(value.id, workspaceId, appId).first<AnnotationRow>();
    if (!row) throw new WishlistConnectorError('ANNOTATION_NOT_FOUND', 'The note was not found.', 404);
    return publicAnnotation(row);
  }

  async function remove(workspaceId: string, appId: number, input: unknown): Promise<boolean> {
    const id = typeof (input as { id?: unknown })?.id === 'string' ? (input as { id: string }).id : '';
    if (!/^annotation_[0-9a-f]{32}$/.test(id)) {
      throw new WishlistConnectorError('INVALID_ANNOTATION', 'The note identifier was not accepted.', 400);
    }
    const result = await db.prepare(
      'DELETE FROM wishlist_annotations WHERE id = ? AND workspace_id = ? AND app_id = ?',
    ).bind(id, workspaceId, appId).run();
    return Boolean(result.meta.changes);
  }

  return { list, create, update, remove };
}

function annotationInput(input: unknown, requireId = false): { id: string; date: string; note: string } {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const id = typeof body.id === 'string' ? body.id : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (requireId && !/^annotation_[0-9a-f]{32}$/.test(id)) {
    throw new WishlistConnectorError('INVALID_ANNOTATION', 'The note identifier was not accepted.', 400);
  }
  if (!isCalendarDate(date) || !note || note.length > 200) {
    throw new WishlistConnectorError('INVALID_ANNOTATION', 'Choose a valid date and enter a note of 1 to 200 characters.', 400);
  }
  return { id, date, note };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function publicAnnotation(row: AnnotationRow): WishlistAnnotation {
  return { id: row.id, date: row.report_date, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at };
}
