import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePgDump } from '../ops/legacyDump';

// The shape backup.ps1 writes (pg_dump --clean --if-exists), cut down.
const dump = [
  '-- PostgreSQL database dump',
  'SET client_encoding = \'UTF8\';',
  'COPY public."AdminUser" (id, username, "passwordHash") FROM stdin;',
  'a1\twill\t$2b$12$secret',
  '\\.',
  '',
  'COPY public."Client" (id, name, "contactEmail", "defaultChargeRate", notes, archived, "createdAt", "updatedAt") FROM stdin;',
  'c1\tPopcorn\t\\N\t15.00\tTab\\there, line\\nbreak, back\\\\slash\tf\t2026-08-29 15:42:10.348\t2026-08-29 15:42:10.348',
  '\\.',
  'COPY public."Staff" (id, "firstName", "lastName", "hourlyRate", "createdAt", "updatedAt") FROM stdin;',
  's1\tJada\tX\t12.71\t2026-09-03 18:42:13.145\t2026-09-03 18:42:13.145',
  '\\.',
  'COPY public."Job" (id, reference, date, "startTime", "breakMinutes", ongoing, "repeatDays", "staffNeeded", "createdAt", "updatedAt") FROM stdin;',
  'j2\tVJ-2\t2026-09-02\t07:00\t30\tt\t{1,2,3,4,5}\t\\N\t2026-09-01 10:00:00\t2026-09-01 10:00:00',
  'j1\tVJ-1\t2026-09-01\t07:00\t0\tf\t{}\t2\t2026-09-01 09:00:00\t2026-09-01 09:00:00',
  '\\.',
  'COPY public."Assignment" (id, "jobId", "staffId", hours, "createdAt", "updatedAt") FROM stdin;',
  '\\.',
].join('\r\n');

test('reads the desktop tables and never the login table', () => {
  const d = parsePgDump(dump);
  assert.equal(d.clients.length, 1);
  assert.equal(d.staff.length, 1);
  assert.equal(d.assignments.length, 0);
  assert.deepEqual(d.leads, []);
  assert.ok(!JSON.stringify(d).includes('secret'));
});

test('turns COPY text into the values the importer expects', () => {
  const d = parsePgDump(dump);
  const c = d.clients[0];
  assert.equal(c.contactEmail, null);
  assert.equal(c.defaultChargeRate, '15.00');
  assert.equal(c.notes, 'Tab\there, line\nbreak, back\\slash');
  assert.equal(c.archived, false);
  // Prisma stores these in UTC
  assert.equal(c.createdAt.toISOString(), '2026-08-29T15:42:10.348Z');
  const [j1, j2] = d.jobs; // ordered by date
  assert.equal(j1.reference, 'VJ-1');
  assert.equal(j1.date, '2026-09-01');
  assert.equal(j1.staffNeeded, 2);
  assert.deepEqual(j1.repeatDays, []);
  assert.equal(j2.ongoing, true);
  assert.equal(j2.breakMinutes, 30);
  assert.deepEqual(j2.repeatDays, [1, 2, 3, 4, 5]);
});

test('refuses a file that is not a desktop tool backup', () => {
  assert.throws(() => parsePgDump('SELECT 1;'), /not a backup from the desktop VERGO Ops tool/);
});

// A backup run killed part way (8 Oct 2026) leaves a file that stops wherever
// pg_dump had got to. None of it may be read as though it were all the data.
test('says a backup cut short is incomplete, wherever it stops', () => {
  const lines = dump.split('\r\n');
  const at = (text: string) => lines.findIndex((l) => l.startsWith(text));

  // Before any data, as on 8 Oct: only the start of the table definitions.
  const beforeData = ['-- PostgreSQL database dump', 'SET client_encoding = \'UTF8\';', 'CREATE TABLE public."AdminUser" ('].join('\r\n');
  assert.throws(() => parsePgDump(beforeData), /backup is incomplete/);

  // Between two rows of a table: every line looks fine, but the table never ends.
  const midTable = lines.slice(0, at('j1')).join('\r\n');
  assert.throws(() => parsePgDump(midTable), /backup is incomplete/);
  assert.throws(() => parsePgDump(midTable + '\r\n'), /backup is incomplete/);

  // Part way through a row.
  const midRow = lines.slice(0, at('j1')).join('\r\n') + '\r\nj1\tVJ-1\t2026-09';
  assert.throws(() => parsePgDump(midRow), /backup is incomplete/);

  // A finished backup is still read, with or without pg_dump's closing line.
  assert.equal(parsePgDump(dump).jobs.length, 2);
  assert.equal(parsePgDump(dump + '\r\n--\r\n-- PostgreSQL database dump complete\r\n--\r\n').jobs.length, 2);
});

test('a malformed row in the middle is still called malformed, not incomplete', () => {
  const broken = dump.replace('s1\tJada\tX\t12.71', 's1\tJada\t12.71');
  assert.throws(() => parsePgDump(broken), /Staff table has a malformed row/);
});
