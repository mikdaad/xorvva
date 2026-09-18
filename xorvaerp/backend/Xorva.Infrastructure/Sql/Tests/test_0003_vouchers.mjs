// 0003 — post_voucher_atomic / reverse_voucher / ledger invariant triggers / RLS.
import { connect, harness, ensureAppRole, IDS, L, lines, mkVoucher } from './_client.mjs';
const c = await connect();
const { ok, expectError, expectOk, ctx, finish } = harness(c);
const { TN, CO, BANK, CASH, RENT, INACTIVE, CC_GROUP, V1 } = IDS;
await ctx();

// --- seed sanity
const { rows: [v1] } = await c.query(`SELECT "VoucherNumber","Status","JournalEntryId","FiscalPeriodId","CreatedBy" FROM "Vouchers" WHERE "Id"=$1`, [V1]);
ok('seed voucher posted with PV-2026-00001', v1.VoucherNumber === 'PV-2026-00001' && v1.Status === 'Posted' && v1.JournalEntryId && v1.FiscalPeriodId && v1.CreatedBy === IDS.U, JSON.stringify(v1));
const { rows: [je] } = await c.query(`SELECT "EntryNumber","Status","SourceType","SourceId","TotalDebit" FROM "JournalEntries" WHERE "Id"=$1`, [v1.JournalEntryId]);
ok('journal number from AccountingSettings sequence (JV-2026-0007), SourceType Voucher', je.EntryNumber === 'JV-2026-0007' && je.SourceType === 'Voucher' && je.SourceId === V1 && Number(je.TotalDebit) === 5000, JSON.stringify(je));
const { rows: bal } = await c.query(`SELECT "Code","CurrentBalance" FROM "Accounts" WHERE "Code" IN ('1000','5000') ORDER BY "Code"`);
ok('Account.CurrentBalance maintained like JournalPoster', Number(bal[0].CurrentBalance) === -5000 && Number(bal[1].CurrentBalance) === 5000, JSON.stringify(bal));
const { rows: [ccb] } = await c.query(`SELECT * FROM accounting.cost_centre_balance($1)`, [CC_GROUP]);
ok('cost centre group rolls up leaf', Number(ccb.debit) === 5000);

// --- posting validation
await mkVoucher(c, 'Journal', '2026-09-10', 'e0000000-0000-0000-0000-000000000010');
const J = 'e0000000-0000-0000-0000-000000000010';
await expectError('unbalanced entry rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(RENT, 100, 0), L(BANK, 0, 90))})`, 'not balanced');
await expectError('single line rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(RENT, 100, 0))})`, 'at least two');
await expectError('line with both sides rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(RENT, 100, 100), L(BANK, 0, 0))})`, 'either a debit OR a credit');
await expectError('zero amount rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(RENT, 0, 0), L(BANK, 0, 0))})`, 'either a debit OR a credit|zero');
await expectError('inactive account rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(INACTIVE, 100, 0), L(BANK, 0, 100))})`, 'inactive');
await expectError('foreign account rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L('a0000000-0000-0000-0000-00000000dead', 100, 0), L(BANK, 0, 100))})`, 'do not exist');
await expectError('group cost centre rejected', `SELECT accounting.post_voucher_atomic('${J}', ${lines(L(RENT, 100, 0, { cost_centre_id: CC_GROUP }), L(BANK, 0, 100))})`, 'group');
await mkVoucher(c, 'Journal', '2026-08-10', 'e0000000-0000-0000-0000-000000000011');
await expectError('closed period rejected', `SELECT accounting.post_voucher_atomic('e0000000-0000-0000-0000-000000000011', ${lines(L(RENT, 100, 0), L(BANK, 0, 100))})`, 'closed');
await mkVoucher(c, 'Contra', '2027-03-10', 'e0000000-0000-0000-0000-000000000012');
await expectOk('no period covering date → permissive (PeriodGuard parity)', `SELECT accounting.post_voucher_atomic('e0000000-0000-0000-0000-000000000012', ${lines(L(CASH, 100, 0), L(BANK, 0, 100))})`);
await expectError('double post rejected', `SELECT accounting.post_voucher_atomic('e0000000-0000-0000-0000-000000000012', ${lines(L(CASH, 100, 0), L(BANK, 0, 100))})`, "status 'Posted'");

// --- immutability of the single ledger
await expectError('posted JE header edit rejected', `UPDATE "JournalEntries" SET "TotalDebit"=1 WHERE "Id"='${v1.JournalEntryId}'`, 'Cannot update posted');
await expectError('posted JE delete rejected', `DELETE FROM "JournalEntries" WHERE "Id"='${v1.JournalEntryId}'`, 'Cannot delete');
await expectError('posted JE line edit rejected', `UPDATE "JournalLines" SET "Debit"=1 WHERE "JournalEntryId"='${v1.JournalEntryId}' AND "Debit">0`, 'Cannot update|Cannot modify');
await expectError('posted JE line delete rejected', `DELETE FROM "JournalLines" WHERE "JournalEntryId"='${v1.JournalEntryId}'`, 'Cannot delete');
await expectError('adding a line to an old posted entry rejected', `INSERT INTO "JournalLines" ("Id","TenantId","CompanyId","JournalEntryId","AccountId","Debit","Credit","IsReconciled","CreatedAt") VALUES (gen_random_uuid(),'${TN}','${CO}','${v1.JournalEntryId}','${RENT}',1,0,false,now())`, 'Cannot add');
await expectOk('IsReconciled flip allowed on posted line', `UPDATE "JournalLines" SET "IsReconciled"=true WHERE "JournalEntryId"='${v1.JournalEntryId}' AND "Credit">0; UPDATE "JournalLines" SET "IsReconciled"=false WHERE "JournalEntryId"='${v1.JournalEntryId}'`);
await expectError('unbalanced EF-style insert rejected at commit', `INSERT INTO "JournalEntries" ("Id","TenantId","CompanyId","EntryNumber","Date","Description","SourceType","Status","PostedAt","TotalDebit","TotalCredit","CreatedAt")
   VALUES ('e1000000-0000-0000-0000-000000000001','${TN}','${CO}','JV-TEST-1','2026-09-12','ef','Manual','Posted',now(),50,50,now());
   INSERT INTO "JournalLines" ("Id","TenantId","CompanyId","JournalEntryId","AccountId","Debit","Credit","IsReconciled","CreatedAt") VALUES (gen_random_uuid(),'${TN}','${CO}','e1000000-0000-0000-0000-000000000001','${RENT}',50,0,false,now())`, 'not balanced|at least 2 lines');
await expectOk('balanced EF-style insert (header Posted + lines in same txn) accepted', `INSERT INTO "JournalEntries" ("Id","TenantId","CompanyId","EntryNumber","Date","Description","SourceType","Status","PostedAt","TotalDebit","TotalCredit","CreatedAt")
   VALUES ('e1000000-0000-0000-0000-000000000002','${TN}','${CO}','JV-TEST-2','2026-09-12','ef','Manual','Posted',now(),50,50,now());
   INSERT INTO "JournalLines" ("Id","TenantId","CompanyId","JournalEntryId","AccountId","Debit","Credit","IsReconciled","CreatedAt") VALUES
     (gen_random_uuid(),'${TN}','${CO}','e1000000-0000-0000-0000-000000000002','${RENT}',50,0,false,now()),
     (gen_random_uuid(),'${TN}','${CO}','e1000000-0000-0000-0000-000000000002','${BANK}',0,50,false,now());
   -- what JournalPoster does in C# after SaveChanges: keep the CurrentBalance cache in step
   UPDATE "Accounts" SET "CurrentBalance"="CurrentBalance"+50 WHERE "Id"='${RENT}';
   UPDATE "Accounts" SET "CurrentBalance"="CurrentBalance"-50 WHERE "Id"='${BANK}'`);
await expectError('EF-style post into closed period rejected', `INSERT INTO "JournalEntries" ("Id","TenantId","CompanyId","EntryNumber","Date","Description","SourceType","Status","PostedAt","TotalDebit","TotalCredit","CreatedAt")
   VALUES ('e1000000-0000-0000-0000-000000000003','${TN}','${CO}','JV-TEST-3','2026-08-12','ef','Manual','Posted',now(),50,50,now())`, 'closed');
await expectOk('Posted → Voided allowed (Xorva void-by-reversal)', `UPDATE "JournalEntries" SET "Status"='Voided' WHERE "Id"='e1000000-0000-0000-0000-000000000002'`);
await expectError('Voided is terminal', `UPDATE "JournalEntries" SET "Status"='Posted' WHERE "Id"='e1000000-0000-0000-0000-000000000002'`, 'Voided|Cannot update');

// --- voucher immutability
await expectError('posted voucher edit rejected', `UPDATE "Vouchers" SET "Narration"='x' WHERE "Id"='${V1}'`, 'Cannot update posted');
await expectOk('AmountPaid tracking allowed on posted voucher', `UPDATE "Vouchers" SET "AmountPaid"=1000 WHERE "Id"='${V1}'`);
await expectError('posted voucher delete rejected', `DELETE FROM "Vouchers" WHERE "Id"='${V1}'`, 'Cannot delete');
await expectError('posted voucher lines locked', `INSERT INTO "VoucherLines" ("TenantId","CompanyId","VoucherId","LineNumber","AccountId") VALUES ('${TN}','${CO}','${V1}',99,'${RENT}')`, 'Cannot modify lines');
await expectOk('draft voucher can be deleted', `DELETE FROM "Vouchers" WHERE "Id"='${J}'`);

// --- accounts / cost centres guards
await expectError('system account delete blocked', `DELETE FROM "Accounts" WHERE "Id"='${BANK}'`, 'system account');
await expectError('account with lines delete blocked', `DELETE FROM "Accounts" WHERE "Id"='${RENT}'`, 'journal line');
await expectError('cost centre with lines delete blocked', `DELETE FROM "CostCentres" WHERE "Id"='${IDS.CC_LEAF}'`, 'journal line|cannot be deleted');

// --- reversal
await expectError('reversal needs a reason', `SELECT accounting.reverse_voucher('${V1}', '')`, 'reason');
await expectError('reversal of a draft rejected', `SELECT accounting.reverse_voucher('e0000000-0000-0000-0000-000000000011', 'x')`, 'Only posted');
const { rows: [{ reverse_voucher: rev }] } = await c.query(`SELECT accounting.reverse_voucher($1, 'Duplicate payment', '2026-09-20')`, [V1]);
const { rows: [orig] } = await c.query(`SELECT v."Status", v."ReversedById", e."Status" je_status, e."ReversedById" je_rev FROM "Vouchers" v JOIN "JournalEntries" e ON e."Id"=v."JournalEntryId" WHERE v."Id"=$1`, [V1]);
ok('original → Reversed, its entry → Voided, both linked', orig.Status === 'Reversed' && orig.ReversedById === rev && orig.je_status === 'Voided' && orig.je_rev, JSON.stringify(orig));
const { rows: [rv] } = await c.query(`SELECT v."VoucherNumber", v."Status", v."ReversalOfId", e."SourceType", e."SourceId", e."TotalDebit" FROM "Vouchers" v JOIN "JournalEntries" e ON e."Id"=v."JournalEntryId" WHERE v."Id"=$1`, [rev]);
ok('reversal voucher posted, SourceType Reversal, SourceId = original entry', rv.Status === 'Posted' && rv.ReversalOfId === V1 && rv.SourceType === 'Reversal' && rv.SourceId === v1.JournalEntryId && Number(rv.TotalDebit) === 5000, JSON.stringify(rv));
const { rows: bal2 } = await c.query(`SELECT "Code","CurrentBalance" FROM "Accounts" WHERE "Code" IN ('1000','5000') ORDER BY "Code"`);
ok('balances net out after reversal (bank: -100 contra -50 JV-TEST-2; rent: +50 JV-TEST-2)', Number(bal2[0].CurrentBalance) === -150 && Number(bal2[1].CurrentBalance) === 50, JSON.stringify(bal2));
await expectError('reversed voucher frozen', `UPDATE "Vouchers" SET "AmountPaid"=0 WHERE "Id"='${V1}'`, 'reversed');

// --- RLS as a non-owner role
await ensureAppRole(c);
const a = await connect('xorva_app');
const count = async (sql) => Number((await a.query(sql)).rows[0].n);
ok('no context → 0 rows', await count(`SELECT count(*) n FROM "Vouchers"`) === 0);
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${CO}',2,false)`);
ok('own company sees vouchers', await count(`SELECT count(*) n FROM "Vouchers"`) >= 3);
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${IDS.CO2}',2,false)`);
ok('other company sees 0', await count(`SELECT count(*) n FROM "Vouchers"`) === 0);
let insertBlocked = false;
try { await a.query(`INSERT INTO "Vouchers" ("TenantId","CompanyId","VoucherType","VoucherNumber","VoucherDate") VALUES ('${TN}','${CO}','Journal','X-1','2026-09-10')`); } catch { insertBlocked = true; }
ok('insert into foreign company blocked by RLS', insertBlocked);
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${IDS.CO2}',1,true)`);
ok('CEO cross-company sees all tenant rows', await count(`SELECT count(*) n FROM "Vouchers"`) >= 3);
await a.query(`SELECT app.set_session_context('${IDS.U}','99999999-0000-0000-0000-000000000001','${CO}',1,true)`);
ok('other tenant sees 0', await count(`SELECT count(*) n FROM "Vouchers"`) === 0);
await a.end();

await finish();
