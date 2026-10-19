import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * What an admin site-content save changed, kept on its ContentChange row so
 * the change can be undone from Admin > Site content > History.
 *
 *   row:     one record created (before null), edited, or deleted (after null).
 *            For SiteSetting the id is the key and the snapshots are the value.
 *   reorder: the order of a list, before and after.
 *
 * Snapshots are the record as JSON without updatedAt, so dates are ISO
 * strings, which Prisma takes back as they are.
 */
export const TABLES = ['SiteSetting', 'Rate', 'Testimonial', 'RecentWork', 'Faq', 'GalleryPhoto', 'SeasonalPromo'] as const;
export type Table = (typeof TABLES)[number];

type Snapshot = Record<string, unknown>;
export type ChangeDetail =
  | { kind: 'row'; table: Table; id: string; before: unknown; after: unknown; revertOf?: string }
  | { kind: 'reorder'; table: Table; before: OrderEntry[]; after: OrderEntry[]; revertOf?: string };
export interface OrderEntry { id: string; order: number }

/** The column a table keeps its list order in. */
export function orderField(table: Table): 'order' | 'sortOrder' {
  return table === 'Rate' ? 'sortOrder' : 'order';
}

export class RevertError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

/** A record as stored on a change: plain JSON, no updatedAt. */
export function snapshot(row: unknown): Snapshot | null {
  if (!row) return null;
  const plain = JSON.parse(JSON.stringify(row)) as Snapshot;
  delete plain.updatedAt;
  return plain;
}

function delegate(table: Exclude<Table, 'SiteSetting'>): any {
  switch (table) {
    case 'Rate': return prisma.rate;
    case 'Testimonial': return prisma.testimonial;
    case 'RecentWork': return prisma.recentWork;
    case 'Faq': return prisma.faq;
    case 'GalleryPhoto': return prisma.galleryPhoto;
    case 'SeasonalPromo': return prisma.seasonalPromo;
  }
}

/** The record as it stands now, in the same shape as a stored snapshot. */
async function current(table: Table, id: string): Promise<unknown> {
  if (table === 'SiteSetting') {
    const row = await prisma.siteSetting.findUnique({ where: { key: id } });
    return row ? JSON.parse(JSON.stringify(row.value)) : null;
  }
  return snapshot(await delegate(table).findUnique({ where: { id } }));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys((value as Snapshot)[k])]));
  }
  return value;
}

export function isRevertible(detail: unknown): detail is ChangeDetail {
  const d = detail as ChangeDetail | null;
  return Boolean(d && (d.kind === 'row' || d.kind === 'reorder') && (TABLES as readonly string[]).includes(d.table));
}

/**
 * Puts back what a change replaced. Refuses (409) when the record has changed
 * again since, so a revert can never silently undo a later edit: revert the
 * later change first. Returns the detail of the revert itself, which is a
 * change like any other and can be reverted in turn.
 */
export async function revertChange(changeId: string, detail: ChangeDetail): Promise<{ what: string; detail: ChangeDetail }> {
  const changedSince = new RevertError('This has been changed again since. Revert the later change first.');

  if (detail.kind === 'reorder') {
    const model = delegate(detail.table as Exclude<Table, 'SiteSetting'>);
    const field = orderField(detail.table);
    const rows: Array<Record<string, any>> = await model.findMany({ where: { id: { in: detail.after.map((e) => e.id) } }, select: { id: true, [field]: true } });
    const now = new Map(rows.map((r) => [r.id, r[field]]));
    if (detail.after.some((e) => now.get(e.id) !== e.order)) throw changedSince;
    await prisma.$transaction(detail.before.map((e) => model.update({ where: { id: e.id }, data: { [field]: e.order } })));
    return {
      what: `Reverted a reorder of ${detail.table}`,
      detail: { kind: 'reorder', table: detail.table, before: detail.after, after: detail.before, revertOf: changeId },
    };
  }

  const { table, id, before, after } = detail;
  if (!same(await current(table, id), after)) throw changedSince;

  if (table === 'SiteSetting') {
    if (before === null || before === undefined) await prisma.siteSetting.delete({ where: { key: id } });
    else await prisma.siteSetting.upsert({ where: { key: id }, create: { key: id, value: before as Prisma.InputJsonValue }, update: { value: before as Prisma.InputJsonValue } });
  } else {
    const model = delegate(table);
    if (before === null || before === undefined) {
      await model.delete({ where: { id } });
    } else if (after === null || after === undefined) {
      await model.create({ data: before });
    } else {
      const { id: _id, createdAt: _created, ...fields } = before as Snapshot;
      await model.update({ where: { id }, data: fields });
    }
  }
  return {
    what: `Reverted: ${before == null ? 'removed what was added' : after == null ? 'put back what was deleted' : 'restored the earlier version'} (${table === 'SiteSetting' ? `${id} settings` : table})`,
    detail: { kind: 'row', table, id, before: after ?? null, after: before ?? null, revertOf: changeId },
  };
}
