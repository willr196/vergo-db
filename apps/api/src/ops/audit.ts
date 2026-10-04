import type { Prisma, PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

export function actorOf(req: Request): string {
  return req.session?.username || 'admin';
}

/** Dates to ISO strings and Decimals to numbers, so the JSON reads cleanly. */
function plain(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v)));
}

/** Write one audit row. Pass the transaction client when inside one, so the log and the change commit together. */
export async function writeAudit(actor: string, entry: AuditEntry, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: plain(entry.oldValue),
      newValue: plain(entry.newValue),
      reason: entry.reason ?? null,
    },
  });
}

/**
 * For older admin routes whose change is already saved outside a transaction:
 * a failed audit write is logged loudly but does not turn a saved change into
 * an error response.
 */
export async function writeAuditBestEffort(actor: string, entry: AuditEntry) {
  try {
    await writeAudit(actor, entry);
  } catch (error) {
    console.error('[AUDIT] Failed to write audit entry', entry.action, entry.entityId, error);
  }
}

/** Only the fields that changed, before and after. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = JSON.stringify(plain(before[key]) ?? null);
    const b = JSON.stringify(plain(after[key]) ?? null);
    if (a !== b) {
      oldValue[key] = before[key] ?? null;
      newValue[key] = after[key] ?? null;
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
}
