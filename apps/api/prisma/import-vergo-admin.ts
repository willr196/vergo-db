/**
 * Imports the desktop VERGO Ops tool (Documents/vergo_admin) into VERGO Ops
 * on the website. The importer itself is src/ops/legacyImport.ts; Ops > Import
 * runs the same thing from an uploaded backup.
 *
 *   npm run import:vergo-admin                       dry run: reports what it would do
 *   npm run import:vergo-admin -- --commit           writes it
 *   npm run import:vergo-admin -- --file <backup.sql> reads a backup instead of the database
 *
 * Reads the desktop database from OLD_DATABASE_URL, or failing that from
 * ~/Documents/vergo_admin/apps/api/.env. Writes to this app's DATABASE_URL,
 * and refuses a non-local target unless ALLOW_REMOTE_DB=1 (scripts/guard-db-target.js).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../src/prisma';
import { importLegacy, parsePgDump, type LegacyData } from '../src/ops/legacyImport';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client: PgClient, types: pgTypes } = require('pg');
// DATE columns as plain YYYY-MM-DD. The default parses them to local midnight,
// which in British Summer Time is the previous day in UTC.
pgTypes.setTypeParser(1082, (v: string) => v);
// Prisma writes timestamp(3) without time zone in UTC; the default reads it as local time.
pgTypes.setTypeParser(1114, (v: string) => new Date(`${v.replace(' ', 'T')}Z`));

const COMMIT = process.argv.includes('--commit');
const fileArg = process.argv.indexOf('--file');
const FILE = fileArg >= 0 ? process.argv[fileArg + 1] : null;

function oldDatabaseUrl(): string {
  if (process.env.OLD_DATABASE_URL) return process.env.OLD_DATABASE_URL;
  const envFile = path.join(os.homedir(), 'Documents', 'vergo_admin', 'apps', 'api', '.env');
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
  }
  throw new Error('Set OLD_DATABASE_URL to the desktop vergo_admin database, or pass --file <backup.sql>.');
}

async function readDatabase(): Promise<LegacyData> {
  const old = new PgClient({ connectionString: oldDatabaseUrl() });
  await old.connect();
  const q = async (sql: string) => (await old.query(sql)).rows as Record<string, any>[];
  const tableExists = async (name: string) => (await q(`SELECT to_regclass('public."${name}"') AS t`))[0].t !== null;
  try {
    const [clients, staff, jobs, assignments] = await Promise.all([
      q('SELECT * FROM "Client" ORDER BY "createdAt"'),
      q('SELECT * FROM "Staff" ORDER BY "createdAt"'),
      q('SELECT * FROM "Job" ORDER BY date, "startTime"'),
      q('SELECT * FROM "Assignment" ORDER BY "createdAt"'),
    ]);
    const leads = (await tableExists('Lead')) ? await q('SELECT * FROM "Lead" ORDER BY "createdAt"') : [];
    const scheduleItems = (await tableExists('JobScheduleItem')) ? await q('SELECT * FROM "JobScheduleItem" ORDER BY "createdAt"') : [];
    return { clients, staff, jobs, assignments, leads, scheduleItems };
  } finally {
    await old.end();
  }
}

async function main() {
  const data = FILE ? parsePgDump(fs.readFileSync(FILE, 'utf8')) : await readDatabase();
  const s = { clients: data.clients.length, staff: data.staff.length, jobs: data.jobs.length, assignments: data.assignments.length, leads: data.leads.length, scheduleItems: data.scheduleItems.length };
  console.log(`Desktop tool: ${s.clients} clients, ${s.staff} staff, ${s.jobs} jobs, ${s.assignments} assignments, ${s.leads} leads, ${s.scheduleItems} running order lines.`);
  console.log(COMMIT ? 'Writing (--commit).\n' : 'Dry run: nothing is written. Add --commit to import.\n');

  const result = await importLegacy(data, { commit: COMMIT, actor: 'import:vergo-admin' });
  console.log(result.report.join('\n'));
  console.log('\nSummary (created / linked to an existing record / skipped):');
  for (const [entity, c] of Object.entries(result.counts)) console.log(`  ${entity.padEnd(18)} ${c.created} / ${c.linked} / ${c.skipped}`);
  if (result.seriesDaysAdded) console.log(`\nRepeating bookings: added ${result.seriesDaysAdded} upcoming day(s).`);
  if (!COMMIT) console.log('\nDry run only. Run again with --commit to import.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
