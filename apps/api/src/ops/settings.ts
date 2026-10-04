/**
 * VERGO Ops settings, stored in OpsSetting (one row per key) so thresholds can
 * change by tax year without a deploy. Every value is validated on write and
 * falls back to the defaults here when it has never been set.
 */

import { z } from 'zod';
import { prisma } from '../prisma';
import type { PensionThresholds, PayFrequency } from './pension';

const thresholdsSchema = z.record(
  z.string().regex(/^\d{4}-\d{2}$/, 'Tax year like 2026-27'),
  z.object({
    lowerQualifyingAnnual: z.number().positive().max(1_000_000),
    earningsTriggerAnnual: z.number().positive().max(1_000_000),
    upperQualifyingAnnual: z.number().positive().max(1_000_000),
    verified: z.boolean(),
  })
);

export const settingsSchemas = {
  /** VERGO's workplace pension duties start (staging) date, YYYY-MM-DD. */
  pensionDutiesStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  payFrequency: z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly']),
  statePensionAge: z.number().int().min(60).max(70),
  pensionThresholds: thresholdsSchema,
};

export type OpsSettingKey = keyof typeof settingsSchemas;

export interface OpsSettings {
  pensionDutiesStartDate: string | null;
  payFrequency: PayFrequency;
  statePensionAge: number;
  pensionThresholds: Record<string, PensionThresholds>;
}

/**
 * 2025-26 automatic-enrolment thresholds as published by The Pensions
 * Regulator (£6,240 / £10,000 / £50,270). Marked unverified so the settings
 * page asks someone to confirm them, and add the 2026-27 figures.
 */
export const DEFAULT_SETTINGS: OpsSettings = {
  pensionDutiesStartDate: null,
  payFrequency: 'weekly',
  statePensionAge: 66,
  pensionThresholds: {
    '2025-26': { lowerQualifyingAnnual: 6240, earningsTriggerAnnual: 10000, upperQualifyingAnnual: 50270, verified: false },
  },
};

export async function loadOpsSettings(): Promise<OpsSettings> {
  const rows = await prisma.opsSetting.findMany();
  const settings: OpsSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const key = row.key as OpsSettingKey;
    const schema = settingsSchemas[key];
    if (!schema) continue;
    const parsed = schema.safeParse(row.value);
    if (parsed.success) (settings as any)[key] = parsed.data;
  }
  return settings;
}
