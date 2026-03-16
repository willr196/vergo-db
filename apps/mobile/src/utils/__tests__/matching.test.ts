import { calculateSkillMatch } from '../matching';
import type { Job, JobSeeker } from '../../types';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    clientCompanyId: 'client-1',
    title: 'Bartender needed',
    role: 'bartender',
    description: 'Busy venue looking for cover.',
    venue: 'The Vergo',
    address: '1 High Street',
    city: 'London',
    date: '2026-03-21',
    startTime: '18:00',
    endTime: '23:00',
    hourlyRate: 15,
    dbsRequired: false,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

function buildJobSeeker(skills: string[]): Pick<JobSeeker, 'skills'> {
  return { skills };
}

describe('calculateSkillMatch', () => {
  it('matches profile skills against role and listed requirements', () => {
    const result = calculateSkillMatch(
      buildJob({
        requirements: 'Cocktail making, cash handling, customer service',
      }),
      buildJobSeeker(['Mixology', 'Cash handling', 'Team leadership'])
    );

    expect(result).toEqual({
      percentage: 75,
      totalRequirements: 4,
      matchedRequirements: ['Bartender', 'Cocktail making', 'Cash handling'],
      matchedSkills: ['Mixology', 'Cash handling'],
    });
  });

  it('falls back to role-family matching when requirements are missing', () => {
    const result = calculateSkillMatch(
      buildJob({
        role: 'barista',
        title: 'Barista needed',
        requirements: undefined,
      }),
      buildJobSeeker(['Coffee', 'Latte art'])
    );

    expect(result).toEqual({
      percentage: 100,
      totalRequirements: 1,
      matchedRequirements: ['Barista'],
      matchedSkills: ['Coffee', 'Latte art'],
    });
  });

  it('matches shorter skill phrases inside longer requirement text', () => {
    const result = calculateSkillMatch(
      buildJob({
        role: 'other',
        title: 'Flexible support role',
        requirements: 'Excellent customer service and cash handling',
      }),
      buildJobSeeker(['Customer service'])
    );

    expect(result).toEqual({
      percentage: 33,
      totalRequirements: 3,
      matchedRequirements: ['Excellent customer service'],
      matchedSkills: ['Customer service'],
    });
  });

  it('returns null when the profile has no skills yet', () => {
    const result = calculateSkillMatch(buildJob(), buildJobSeeker([]));
    expect(result).toBeNull();
  });
});
