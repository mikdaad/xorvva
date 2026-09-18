// Shared helpers for the SQL tests.
import pg from 'pg';

export const IDS = {
  TN: '20000000-0000-0000-0000-000000000001',
  CO: '30000000-0000-0000-0000-000000000001',
  CO2: '30000000-0000-0000-0000-000000000002',
  U: '10000000-0000-0000-0000-000000000001',
  BANK: 'a0000000-0000-0000-0000-000000001000',
  CASH: 'a0000000-0000-0000-0000-000000001010',
  RENT: 'a0000000-0000-0000-0000-000000005000',
  INACTIVE: 'a0000000-0000-0000-0000-000000005900',
  CC_GROUP: 'cc000000-0000-0000-0000-000000000001',
  CC_LEAF: 'cc000000-0000-0000-0000-000000000002',
  V1: 'e0000000-0000-0000-0000-000000000001',
};

const cfg = (user) => ({
  host: process.env.PGHOST ?? 'localhost', port: Number(process.env.PGPORT ?? 5432),
  user: user ?? process.env.PGUSER ?? 'postgres', password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE_TEST ?? 'xorva_sqltest',
});

export async function connect(user) { const c = new pg.Client(cfg(user)); await c.connect(); return c; }

export function harness(c) {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };
  async function expectError(name, sql, needle) {
    try { await c.query('BEGIN'); await c.query(sql); await c.query('COMMIT'); ok(name, false, 'NO ERROR (expected /' + needle + '/)'); }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); ok(name, new RegExp(needle, 'i').test(e.message), e.message); }
  }
  async function expectOk(name, sql) {
    try { await c.query('BEGIN'); const r = await c.query(sql); await c.query('COMMIT'); ok(name, true); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); ok(name, false, e.message); }
  }
  const ctx = (role = 2, company = IDS.CO, cross = false) =>
    c.query(`SELECT app.set_session_context('${IDS.U}','${IDS.TN}','${company}',${role},${cross})`);
  const finish = async () => { console.log(`  ${pass} passed, ${fail} failed`); await c.end(); process.exit(fail ? 1 : 0); };
  return { ok, expectError, expectOk, ctx, finish, near };
}

/** Creates the non-owner role used to prove RLS actually filters. */
export async function ensureAppRole(c) {
  await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xorva_app') THEN CREATE ROLE xorva_app LOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public, app, accounting TO xorva_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xorva_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app, accounting TO xorva_app;`);
}

export const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
export const L = (account_id, base_debit, base_credit, extra = {}) => JSON.stringify({ account_id, base_debit, base_credit, ...extra });
export const lines = (...ls) => `'[${ls.join(',')}]'::jsonb`;
export const mkVoucher = (c, type, date, id, company = IDS.CO) => c.query(
  `INSERT INTO "Vouchers" ("Id","TenantId","CompanyId","VoucherType","VoucherNumber","VoucherDate","TotalAmount","BaseTotalAmount")
   VALUES ($1,$2,$3,$4::varchar, accounting.generate_voucher_number($3,$4::text,extract(year from $5::date)::int), $5::date, 100, 100) ON CONFLICT DO NOTHING`,
  [id, IDS.TN, company, type, date]);
