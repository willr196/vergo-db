/**
 * Who can see a job. A job is for everyone unless the office marks it
 * "selected staff only" (Job.inviteOnly); then only the staff invited to it
 * (JobInvite) see it on the job board, open it, or apply.
 *
 * Every list, page and application route that shows staff an open job goes
 * through these, so a selected-staff job never leaks onto a public list.
 */
import type { Prisma } from '@prisma/client';

/** Prisma filter: the jobs this person may see. No user: public jobs only. */
export function jobsVisibleTo(userId?: string | null): Prisma.JobWhereInput {
  return userId
    ? { OR: [{ inviteOnly: false }, { invites: { some: { userId } } }] }
    : { inviteOnly: false };
}

/** For a job already loaded: may this person see it? */
export function canSeeJob(job: { inviteOnly: boolean; invites?: Array<{ userId: string }> }, userId?: string | null): boolean {
  if (!job.inviteOnly) return true;
  return !!userId && !!job.invites?.some((i) => i.userId === userId);
}
