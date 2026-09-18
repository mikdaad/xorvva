// Usage: PGHOST=<socket-or-host> PGPORT=5433 node verify_readmodel.mjs
// Expected noise: Vouchers.AmountDue gen mismatch (generator ignores HasComputedColumnSql),
// BankAccounts.{SwiftCode,Branch,Currency,OpeningBalance,StatementFormat} + VoucherSequences (SQL-only by design),
// partial/DESC index variants. Anything else is a real EF↔SQL disagreement.
// Verifies the EF read-model (new snapshot) agrees with what Sql/Accounting/0001-0007 create.
// 1. DB "sql": baseline WITHOUT ported objects (snapshot from before the port isn't available, so we
//    generate the new snapshot DDL, then DROP the ported tables/columns, then apply SQL scripts).
// 2. DB "ef":  new snapshot DDL only.
// Compare information_schema.columns (name, udt/type, nullable, default presence) for all tables.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(here, '..', 'Accounting');
const gen = spawnSync(process.execPath, [path.join(here, 'snapshot2sql.mjs')], { encoding: 'utf8' });
if (gen.status !== 0) { console.error(gen.stderr); process.exit(1); }
const ddl = gen.stdout;
const admin = new pg.Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5433), user: 'postgres', database: 'postgres' });
await admin.connect();
for (const db of ['vef', 'vsql']) { await admin.query(`DROP DATABASE IF EXISTS ${db}`); await admin.query(`CREATE DATABASE ${db}`); }
await admin.end();
async function client(db) { const c = new pg.Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5433), user: 'postgres', database: db }); await c.connect(); return c; }

const portedTables = ['Vouchers','VoucherLines','CostCentreDimensions','CostCentres','BankStatements','BankStatementLines','BankMatchRules',
  'AccountingDocumentFiles','AccountingDocuments','DocumentExtractions','DocumentFieldSuggestions'];
const portedCols = {
  JournalLines: ['CostCentreId'], JournalEntries: ['VoucherId','ReversedById'],
  FiscalPeriods: ['CloseStatus','ClosedAt','ClosedBy'],
  Accounts: ['NameAr','IsGroup','IsControl','IsBank','PartyTrn','PlaceOfSupply','DefaultTaxRateId'],
  Contacts: ['NameAr','TaxTreatment','ControlAccountId','DefaultTaxRateId','CreditLimit','ContactPerson','AddressLine1','AddressLine2','City','Country'],
  Products: ['NameAr','ItemType','UnitOfMeasure','PurchaseAccountId','PurchasePrice','PurchaseTaxRateId','HsnCode'],
  TaxRates: ['Code','TaxScope','FtaCode','IsDefault'],
  AccountingSettings: ['MailingName','CorporateTaxTrn','IsFreeZone','FreeZoneName','BooksBeginDate','DecimalPlaces','CoaTemplate','DefaultCostCentreDimensionId'],
};

const ef = await client('vef'); await ef.query(ddl);
const sq = await client('vsql'); await sq.query(ddl);
// strip ported objects to simulate the pre-port baseline
for (const t of [...portedTables].reverse()) await sq.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
for (const [t, cols] of Object.entries(portedCols)) for (const c of cols) await sq.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "${c}" CASCADE`);
for (const f of fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sql')).sort()) await sq.query(fs.readFileSync(path.join(scriptsDir, f), 'utf8'));

const q = `SELECT table_name, column_name, udt_name, character_maximum_length len, numeric_precision p, numeric_scale s, is_nullable nul, (column_default IS NOT NULL) hasdef, is_generated gen
           FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2`;
const key = r => `${r.table_name}.${r.column_name}`;
const A = new Map((await ef.query(q)).rows.map(r => [key(r), r]));
const B = new Map((await sq.query(q)).rows.map(r => [key(r), r]));
let diffs = 0;
for (const [k, a] of A) {
  const b = B.get(k);
  if (!b) { console.log(`EF-only column   : ${k}`); diffs++; continue; }
  const fields = ['udt_name','len','p','s','nul','gen'];
  const d = fields.filter(f => String(a[f]) !== String(b[f]));
  if (d.length) { console.log(`MISMATCH ${k}: ` + d.map(f => `${f} ef=${a[f]} sql=${b[f]}`).join(', ')); diffs++; }
}
for (const k of B.keys()) if (!A.has(k)) { console.log(`SQL-only column  : ${k}`); diffs++; }
// unique indexes / FKs on ported tables
const ix = `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename = ANY($1) ORDER BY 1,2`;
const ia = (await ef.query(ix, [portedTables])).rows, ib = (await sq.query(ix, [portedTables])).rows;
const norm = d => d.replace(/INDEX "?\w+"? ON/, 'INDEX ON');
const sa = new Set(ia.map(r => norm(r.indexdef))), sb = new Set(ib.map(r => norm(r.indexdef)));
for (const r of ia) if (!sb.has(norm(r.indexdef))) console.log(`EF-only index    : ${r.indexname}  ${r.indexdef}`);
for (const r of ib) if (!sa.has(norm(r.indexdef))) console.log(`SQL-only index   : ${r.indexname}  ${r.indexdef}`);
console.log(`\ncolumn diffs: ${diffs}; EF indexes ${ia.length} vs SQL indexes ${ib.length}`);
await ef.end(); await sq.end();
