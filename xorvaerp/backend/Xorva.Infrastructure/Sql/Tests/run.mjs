#!/usr/bin/env node
// SQL test runner for the ported accounting scripts.
//
//   PGHOST=/path/to/socket PGPORT=5433 PGUSER=postgres node run.mjs
//
// 1. drops + recreates database `xorva_sqltest`
// 2. loads baseline.sql (EF snapshot → DDL; regenerate with snapshot2sql.mjs)
// 3. applies Sql/Accounting/*.sql in order, TWICE (idempotency check)
// 4. loads seed.sql, then runs every test_*.mjs in this folder
//
// Needs only Node + the `pg` package (npm i pg) + a reachable PostgreSQL ≥ 14.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.PGDATABASE_TEST ?? 'xorva_sqltest';
const base = { host: process.env.PGHOST ?? 'localhost', port: Number(process.env.PGPORT ?? 5432), user: process.env.PGUSER ?? 'postgres', password: process.env.PGPASSWORD };

async function admin(sql) { const c = new pg.Client({ ...base, database: 'postgres' }); await c.connect(); try { await c.query(sql); } finally { await c.end(); } }
await admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin(`CREATE DATABASE ${DB}`);

const c = new pg.Client({ ...base, database: DB });
await c.connect();
const run = async (label, sql) => { try { await c.query(sql); } catch (e) { console.error(`✗ ${label}: ${e.message}`); process.exit(1); } };

// Always regenerate from the current EF snapshot so schema drift is caught.
const gen = spawnSync(process.execPath, [path.join(here, 'snapshot2sql.mjs')], { encoding: 'utf8' });
if (gen.status !== 0) { console.error(gen.stderr); process.exit(1); }
await run('baseline (from EF snapshot)', gen.stdout);

const scriptsDir = path.join(here, '../Accounting');
const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sql')).sort();
for (const pass of [1, 2]) {
  for (const f of scripts) await run(`${f} (pass ${pass}${pass === 2 ? ', idempotency' : ''})`, fs.readFileSync(path.join(scriptsDir, f), 'utf8'));
}
console.log(`✓ ${scripts.length} scripts applied twice without error`);

await run('seed', fs.readFileSync(path.join(here, 'seed.sql'), 'utf8'));
await c.end();

let failed = 0;
for (const t of fs.readdirSync(here).filter(f => /^test_.*\.mjs$/.test(f)).sort()) {
  console.log(`\n── ${t}`);
  const r = spawnSync(process.execPath, [path.join(here, t)], { stdio: 'inherit', env: { ...process.env, PGDATABASE_TEST: DB } });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL SQL TESTS PASSED');
process.exit(failed ? 1 : 0);
