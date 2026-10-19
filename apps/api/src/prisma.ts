import { PrismaClient } from '@prisma/client'
import { COUNT_DB_QUERIES, countQuery } from './lib/dbQueryCount'

// With LOG_DB_QUERIES=1 every query is counted (lib/dbQueryCount.ts); otherwise no query logging at all.
export const prisma: PrismaClient = COUNT_DB_QUERIES
  ? (new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }) as unknown as PrismaClient)
  : new PrismaClient()

if (COUNT_DB_QUERIES) (prisma as unknown as { $on: (e: 'query', fn: () => void) => void }).$on('query', countQuery)
