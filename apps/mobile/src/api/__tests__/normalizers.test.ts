import {
  normalizeApplicationStatus,
  normalizeJob,
  toBackendApplicationStatus,
} from '../normalizers';
import type { ApplicationStatus } from '../../types';

describe('normalizeJob', () => {
  it('normalizes status and position counts', () => {
    const job = normalizeJob({
      id: 'job-1',
      title: 'Bartender',
      description: 'Experienced bartender required for a private event.',
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
      role: { name: 'Bartender' },
      applicationCount: 7,
      createdAt: '2026-03-17T10:00:00.000Z',
      updatedAt: '2026-03-17T11:00:00.000Z',
    });

    expect(job.status).toBe('published');
    expect(job.positionsAvailable).toBe(3);
    expect(job.positionsFilled).toBe(1);
  });

  it('exposes clientId on clientCompanyId and nested clientCompany.id', () => {
    const job = normalizeJob({
      id: 'job-3',
      clientId: 'client-abc',
      title: 'Bartender',
      description: 'Cocktail bartender for a private event.',
      status: 'OPEN',
      location: 'Bristol',
      payRate: 14,
      companyName: 'Acme Events',
      role: { name: 'Bartender' },
    });

    expect(job.clientCompanyId).toBe('client-abc');
    expect(job.clientCompany?.id).toBe('client-abc');
    expect(job.clientCompany?.companyName).toBe('Acme Events');
  });

  it('falls back to empty string when clientId is missing (not company name)', () => {
    const job = normalizeJob({
      id: 'job-4',
      title: 'Server',
      description: 'Server needed.',
      status: 'OPEN',
      location: 'Leeds',
      payRate: 12,
      companyName: 'Acme Events',
      role: { name: 'Server' },
    });

    expect(job.clientCompanyId).toBe('');
    expect(job.clientCompanyId).not.toBe('Acme Events');
    expect(job.clientCompany?.id).toBe('');
  });
});

describe('application status normalizers', () => {
  describe('normalizeApplicationStatus (backend → frontend)', () => {
    it.each([
      ['PENDING', 'pending'],
      ['REVIEWED', 'reviewing'],
      ['SHORTLISTED', 'shortlisted'],
      ['CONFIRMED', 'hired'],
      ['REJECTED', 'rejected'],
      ['WITHDRAWN', 'withdrawn'],
    ] as const)('maps canonical backend %s to frontend %s', (backend, frontend) => {
      expect(normalizeApplicationStatus(backend)).toBe(frontend);
    });

    it.each([
      ['RECEIVED', 'pending'],
      ['REVIEWING', 'reviewing'],
      ['HIRED', 'hired'],
    ] as const)('maps backend alias %s to frontend %s', (alias, frontend) => {
      expect(normalizeApplicationStatus(alias)).toBe(frontend);
    });

    it('falls back to pending for unknown values', () => {
      expect(normalizeApplicationStatus('NOT_A_REAL_STATUS')).toBe('pending');
      expect(normalizeApplicationStatus('')).toBe('pending');
      expect(normalizeApplicationStatus(null)).toBe('pending');
      expect(normalizeApplicationStatus(undefined)).toBe('pending');
    });
  });

  describe('toBackendApplicationStatus (frontend → backend)', () => {
    it.each([
      ['pending', 'PENDING'],
      ['reviewing', 'REVIEWED'],
      ['shortlisted', 'SHORTLISTED'],
      ['hired', 'CONFIRMED'],
      ['rejected', 'REJECTED'],
      ['withdrawn', 'WITHDRAWN'],
    ] as const)('round-trips %s to canonical backend value %s', (frontend, backend) => {
      expect(toBackendApplicationStatus(frontend as ApplicationStatus)).toBe(backend);
    });

    it('never emits alias backend values', () => {
      const aliases = new Set(['RECEIVED', 'REVIEWING', 'HIRED']);
      const frontendValues: ApplicationStatus[] = [
        'pending',
        'reviewing',
        'shortlisted',
        'hired',
        'rejected',
        'withdrawn',
      ];
      for (const value of frontendValues) {
        expect(aliases.has(toBackendApplicationStatus(value))).toBe(false);
      }
    });
  });
});
