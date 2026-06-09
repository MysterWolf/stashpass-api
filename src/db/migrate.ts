import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './client';

async function migrate() {
  process.stdout.write('[migrate] starting\n');
  // __dirname points to dist/db/ after tsc; SQL files stay in src/db/migrations/
  const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
  process.stdout.write(`[migrate] migrationsDir=${migrationsDir}\n`);
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  process.stdout.write('[migrate] connecting to DB\n');
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const { rows } = await db.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await db.query('COMMIT');
      console.log(`  apply ${file}`);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }

  await db.end();
  console.log('Migrations complete.');
}

migrate().catch((err) => {
  process.stdout.write(`[migrate] FAILED: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
