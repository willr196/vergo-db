/**
 * Reads the desktop VERGO Ops tool's daily backups (plain pg_dump .sql files
 * from vergo_admin/backup.ps1). Kept free of app imports so it can be tested alone.
 */

export type Row = Record<string, any>;

export type LegacyData = {
  clients: Row[];
  staff: Row[];
  jobs: Row[];
  assignments: Row[];
  leads: Row[];
  scheduleItems: Row[];
};

// ── Reading a backup ──────────────────────────────────────────────────────

/** The desktop tool's tables, as pg_dump names them. AdminUser (its login) is never read. */
const DUMP_TABLES: Record<string, keyof LegacyData> = {
  Client: 'clients', Staff: 'staff', Job: 'jobs', Assignment: 'assignments', Lead: 'leads', JobScheduleItem: 'scheduleItems',
};
const TIMESTAMP_COLUMNS = new Set(['createdAt', 'updatedAt']);
const BOOLEAN_COLUMNS = new Set(['archived', 'ongoing']);
const INTEGER_COLUMNS = new Set(['breakMinutes', 'staffNeeded']);
const INT_ARRAY_COLUMNS = new Set(['repeatDays']);

/** One field of COPY text format: \N is null, backslash escapes as pg_dump writes them. */
function copyField(raw: string): string | null {
  if (raw === '\\N') return null;
  return raw.replace(/\\(.)/g, (_m, c: string) => ({ t: '\t', n: '\n', r: '\r', b: '\b', f: '\f', v: '\v', '\\': '\\' } as Record<string, string>)[c] ?? c);
}

function typed(column: string, v: string | null): unknown {
  if (v == null) return null;
  // Prisma writes timestamp(3) without time zone in UTC.
  if (TIMESTAMP_COLUMNS.has(column)) return new Date(`${v.replace(' ', 'T')}Z`);
  if (BOOLEAN_COLUMNS.has(column)) return v === 't';
  if (INTEGER_COLUMNS.has(column)) return Number(v);
  if (INT_ARRAY_COLUMNS.has(column)) return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  return v; // dates stay YYYY-MM-DD; money stays a string, as from pg
}

/**
 * Read the desktop tool's tables out of a plain pg_dump backup (the .sql files
 * backup.ps1 writes). Only the COPY blocks are read; nothing in the file is run.
 */
export function parsePgDump(sql: string): LegacyData {
  const data: LegacyData = { clients: [], staff: [], jobs: [], assignments: [], leads: [], scheduleItems: [] };
  const lines = sql.replace(/\r\n/g, '\n').split('\n');
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^COPY public\."?(\w+)"? \((.+)\) FROM stdin;$/);
    if (!m) continue;
    const key = DUMP_TABLES[m[1]];
    const columns = m[2].split(', ').map((c) => c.replace(/^"|"$/g, ''));
    for (i++; i < lines.length && lines[i] !== '\\.'; i++) {
      if (!key) continue;
      const fields = lines[i].split('\t');
      if (fields.length !== columns.length) throw new Error(`The backup's ${m[1]} table has a malformed row.`);
      data[key].push(Object.fromEntries(columns.map((c, n) => [c, typed(c, copyField(fields[n]))])));
    }
    if (key) seen.add(m[1]);
  }
  for (const required of ['Client', 'Staff', 'Job', 'Assignment']) {
    if (!seen.has(required)) throw new Error('This is not a backup from the desktop VERGO Ops tool (no ' + required + ' table found). Choose a vergo-ops-*.sql file from vergo_admin/backups.');
  }
  data.jobs.sort((a, b) => (a.date === b.date ? String(a.startTime).localeCompare(String(b.startTime)) : a.date < b.date ? -1 : 1));
  for (const k of ['clients', 'staff', 'assignments', 'leads', 'scheduleItems'] as const) {
    data[k].sort((a, b) => a.createdAt - b.createdAt);
  }
  return data;
}
