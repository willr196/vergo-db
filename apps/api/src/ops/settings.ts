/**
 * VERGO Ops settings, stored in OpsSetting (one row per key) so thresholds can
 * change by tax year without a deploy. Every value is validated on write and
 * falls back to the defaults here when it has never been set.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { MIN_RATE } from '../site/settings';
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

const pounds = z.number().min(0).max(100_000);

/**
 * The representative pay example in the Key Information Document. Every
 * figure is illustrative; a deduction left empty is shown as depending on
 * the worker's circumstances rather than as a made-up tax result.
 */
const kidPayExampleSchema = z.object({
  hours: z.number().positive().max(300),
  hourlyRate: z.number().positive().max(200),
  holidayPayPercent: z.number().min(0).max(20),
  incomeTax: pounds.nullable(),
  employeeNi: pounds.nullable(),
  pension: pounds.nullable(),
  otherDeductions: pounds.nullable(),
  note: z.string().trim().max(300).nullable(),
});

/**
 * Commercial terms the business-client Terms of Business are built from.
 * Changing them makes a new Terms version. They must be reviewed by the
 * owner (clientCommercialTermsReview) before Terms can be issued.
 */
const commercialTermsSchema = z.object({
  paymentTermsDays: z.number().int().min(0).max(120),
  firstBookingAdvancePayment: z.boolean(),
  /** Charged when the Client cancels within `withinHours` of the start, as a % of the cancelled Charges. */
  cancellation: z.array(z.object({
    withinHours: z.number().int().min(1).max(24 * 60),
    percent: z.number().min(0).max(100),
  })).min(1).max(6),
  replacementWindowMinutes: z.number().int().min(15).max(24 * 60),
  transferFeePercent: z.number().min(0).max(100),
  transferFeeRemunerationMonths: z.number().int().min(1).max(24),
  extendedHireWeeks: z.number().int().min(1).max(104),
});

export const settingsSchemas = {
  /** VERGO's workplace pension duties start (staging) date, YYYY-MM-DD. */
  pensionDutiesStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  payFrequency: z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly']),
  statePensionAge: z.number().int().min(60).max(70),
  pensionThresholds: thresholdsSchema,
  kidPayExample: kidPayExampleSchema,
  clientCommercialTerms: commercialTermsSchema,
};

export type OpsSettingKey = keyof typeof settingsSchemas;
export type KidPayExample = z.infer<typeof kidPayExampleSchema>;
export type CommercialTerms = z.infer<typeof commercialTermsSchema>;

export interface OpsSettings {
  pensionDutiesStartDate: string | null;
  payFrequency: PayFrequency;
  statePensionAge: number;
  pensionThresholds: Record<string, PensionThresholds>;
  kidPayExample: KidPayExample;
  clientCommercialTerms: CommercialTerms;
}

/**
 * 2025-26 automatic-enrolment thresholds as published by The Pensions
 * Regulator (£6,240 / £10,000 / £50,270). Marked unverified so the settings
 * page asks someone to confirm them, and add the 2026-27 figures.
 *
 * Commercial terms: payment and cancellation follow the policy on the public
 * site (SITE_TERMS in config/pricing.ts); the transfer fee and extended hire
 * are VERGO's proposed defaults, which need the owner's review before use.
 */
export const DEFAULT_SETTINGS: OpsSettings = {
  pensionDutiesStartDate: null,
  payFrequency: 'weekly',
  statePensionAge: 66,
  pensionThresholds: {
    '2025-26': { lowerQualifyingAnnual: 6240, earningsTriggerAnnual: 10000, upperQualifyingAnnual: 50270, verified: false },
  },
  kidPayExample: {
    hours: 40,
    hourlyRate: MIN_RATE,
    holidayPayPercent: 12.07,
    incomeTax: null,
    employeeNi: null,
    pension: null,
    otherDeductions: null,
    note: null,
  },
  clientCommercialTerms: {
    paymentTermsDays: 14,
    firstBookingAdvancePayment: true,
    cancellation: [{ withinHours: 48, percent: 10 }, { withinHours: 24, percent: 25 }],
    replacementWindowMinutes: 60,
    transferFeePercent: 15,
    transferFeeRemunerationMonths: 12,
    extendedHireWeeks: 8,
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

// ── Owner review of the commercial terms ───────────────────────────────────

/** Stored outside settingsSchemas so the generic settings route cannot set it. */
export const COMMERCIAL_REVIEW_KEY = 'clientCommercialTermsReview';
export const OWNER_REVIEW_LABEL = 'Commercial term — owner review required';

const reviewSchema = z.object({ valuesHash: z.string(), reviewedAt: z.string(), reviewedBy: z.string() });
export type CommercialReview = z.infer<typeof reviewSchema>;

/** Order-independent fingerprint of the commercial values a review covers. */
export function commercialTermsHash(terms: CommercialTerms): string {
  const canonical = [
    terms.paymentTermsDays, terms.firstBookingAdvancePayment, terms.replacementWindowMinutes,
    terms.transferFeePercent, terms.transferFeeRemunerationMonths, terms.extendedHireWeeks,
    [...terms.cancellation].sort((a, b) => b.withinHours - a.withinHours).map((c) => [c.withinHours, c.percent]),
  ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function loadCommercialReview(terms: CommercialTerms) {
  const row = await prisma.opsSetting.findUnique({ where: { key: COMMERCIAL_REVIEW_KEY } });
  const parsed = row ? reviewSchema.safeParse(row.value) : null;
  const review = parsed?.success ? parsed.data : null;
  const reviewed = review != null && review.valuesHash === commercialTermsHash(terms);
  return { reviewed, review, label: reviewed ? null : OWNER_REVIEW_LABEL };
}
