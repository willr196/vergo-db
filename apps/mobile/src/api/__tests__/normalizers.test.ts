import { normalizeJob } from '../normalizers';

describe('normalizeJob', () => {
  it('preserves backend job tiers and shortlist review timestamps', () => {
    const job = normalizeJob({
      id: 'job-1',
      title: 'Shortlist Bartender',
      description: 'Experienced bartender required for a private event.',
      tier: 'SHORTLIST',
      status: 'OPEN',
      location: 'London',
      venue: 'The Vault',
      payRate: 15,
      payType: 'HOURLY',
      eventDate: '2026-03-21T00:00:00.000Z',
      shiftStart: '18:00',
      shiftEnd: '23:00',
      staffNeeded: 3,
      staffConfirmed: 1,
      companyName: 'Acme Events',
      shortlistReviewedAt: '2026-03-18T09:00:00.000Z',
      role: { name: 'Bartender' },
      applicationCount: 7,
      createdAt: '2026-03-17T10:00:00.000Z',
      updatedAt: '2026-03-17T11:00:00.000Z',
    });

    expect(job.tier).toBe('SHORTLIST');
    expect(job.shortlistReviewedAt).toBe('2026-03-18T09:00:00.000Z');
    expect(job.status).toBe('published');
    expect(job.positionsAvailable).toBe(3);
    expect(job.positionsFilled).toBe(1);
  });

  it('defaults unknown tiers to standard', () => {
    const job = normalizeJob({
      id: 'job-2',
      title: 'General FOH',
      description: 'FOH support needed.',
      tier: 'UNKNOWN',
      status: 'OPEN',
      location: 'Manchester',
      payRate: 13,
      role: { name: 'Front of House' },
    });

    expect(job.tier).toBe('STANDARD');
  });
});
