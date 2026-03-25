import type { JobTier } from '../types';

export function normalizeJobTier(tier?: JobTier | null): JobTier {
  return tier === 'SHORTLIST' || tier === 'GOLD' ? tier : 'STANDARD';
}

export function getJobTierLabel(tier?: JobTier | null): string {
  switch (normalizeJobTier(tier)) {
    case 'SHORTLIST':
      return 'Shortlist';
    case 'GOLD':
      return 'Gold';
    default:
      return 'Standard';
  }
}

export function getJobTierSummary(tier?: JobTier | null): { title: string; body: string } {
  switch (normalizeJobTier(tier)) {
    case 'SHORTLIST':
      return {
        title: 'Shortlist Role',
        body:
          'VERGO reviews applications after the window closes and presents a refined shortlist to the client. Selected workers earn a +£1/hr merit uplift on top of the advertised rate.',
      };
    case 'GOLD':
      return {
        title: 'Gold Managed Role',
        body:
          'This is a senior or lead position managed directly by VERGO, suited to supervisors, head chefs, lead bartenders, and key guest-facing roles.',
      };
    default:
      return {
        title: 'Standard Role',
        body: 'Direct applications at the advertised hourly rate.',
      };
  }
}

export function getJobTierPricingNote(tier?: JobTier | null): string {
  switch (normalizeJobTier(tier)) {
    case 'SHORTLIST':
      return 'Agreed wage + £3/hr + VAT, including a £1/hr merit uplift for selected workers.';
    case 'GOLD':
      return 'From £22/hr + VAT. Chefs from £26/hr + VAT.';
    default:
      return 'Agreed wage + £2/hr + VAT.';
  }
}
