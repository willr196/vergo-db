import pg from 'pg';
const { Client } = pg;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  // Enable TLS only when the URL includes sslmode=require (e.g., Neon).
  // Fly Postgres attachments often use sslmode=disable.
  const ssl = /sslmode=require/i.test(dbUrl) ? { rejectUnauthorized: false } : false;

  const client = new Client({ connectionString: dbUrl, ssl });
  await client.connect();

  const res = await client.query('DELETE FROM user_sessions WHERE expire < NOW();');
  console.log(`🧹 Deleted ${res.rowCount} expired sessions`);

  await client.end();
}

main()
  .then(() => console.log('✅ Cleanup complete'))
  .catch((err) => {
    console.error('❌ Cleanup failed', err);
    process.exit(1);
  });
