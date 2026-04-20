import pg from 'pg';
const { Client } = pg;

const configs = [
  { name: 'pooler-session', host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, user: 'postgres.gapfldixgqpmlzwijftm' },
  { name: 'pooler-transaction', host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: 'postgres.gapfldixgqpmlzwijftm' },
];

const password = process.env.SUPABASE_DB_PASSWORD;

for (const c of configs) {
  const client = new Client({ ...c, password, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    console.log(`SUCCESS: ${c.name} (${c.host}:${c.port})`);
    const res = await client.query('SELECT 1 as test');
    console.log('  Query OK:', res.rows[0]);
    await client.end();
    break;
  } catch (e) {
    console.log(`FAIL: ${c.name} - ${e.message.slice(0, 80)}`);
  }
}
