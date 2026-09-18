// 0005 — master enrichment: account flags/hierarchy, group-posting guard, TRN checks, period close.
import { connect, harness, IDS, L, lines, mkVoucher } from './_client.mjs';
const c = await connect();
const { ok, expectError, expectOk, ctx, finish } = harness(c);
const { TN, CO, BANK, RENT } = IDS;
await ctx();

// --- account flags
const { rows: [bank] } = await c.query(`SELECT "IsBank","IsControl","IsGroup" FROM "Accounts" WHERE "Id"=$1`, [BANK]);
ok('Bank sub-type backfilled to IsBank', bank.IsBank === true && bank.IsGroup === false);
await c.query(`INSERT INTO "Accounts" ("Id","TenantId","CompanyId","Code","Name","AccountType","AccountSubType","NormalBalance","IsSystemAccount","CurrentBalance","IsActive","SortOrder","CreatedAt")
  VALUES ('a0000000-0000-0000-0000-000000001200','${TN}','${CO}','1200','Accounts Receivable','Asset','AccountsReceivable','Debit',true,0,true,5,now()) ON CONFLICT DO NOTHING`);
ok('AR sub-type derives IsControl on insert', (await c.query(`SELECT "IsControl" FROM "Accounts" WHERE "Code"='1200'`)).rows[0].IsControl === true);

// --- hierarchy
await expectOk('create group ledger', `INSERT INTO "Accounts" ("Id","TenantId","CompanyId","Code","Name","AccountType","AccountSubType","NormalBalance","IsSystemAccount","CurrentBalance","IsActive","SortOrder","IsGroup","CreatedAt")
  VALUES ('a0000000-0000-0000-0000-000000005500','${TN}','${CO}','5500','Indirect Expenses','Expense','OperatingExpense','Debit',false,0,true,9,true,now())`);
await expectError('self parent rejected', `UPDATE "Accounts" SET "ParentAccountId"='${RENT}' WHERE "Id"='${RENT}'`, 'own parent');
await expectError('cross-company parent rejected', `INSERT INTO "Accounts" ("Id","TenantId","CompanyId","Code","Name","AccountType","AccountSubType","NormalBalance","IsSystemAccount","CurrentBalance","IsActive","SortOrder","ParentAccountId","CreatedAt")
  VALUES (gen_random_uuid(),'${TN}','${IDS.CO2}','5000','X','Expense','OperatingExpense','Debit',false,0,true,9,'a0000000-0000-0000-0000-000000005500',now())`, 'same company');
await expectError('ledger with lines cannot become a group', `UPDATE "Accounts" SET "IsGroup"=true WHERE "Id"='${RENT}'`, 'cannot be converted');
await expectOk('parent under group ok', `UPDATE "Accounts" SET "ParentAccountId"='a0000000-0000-0000-0000-000000005500' WHERE "Id"='${RENT}'`);
await mkVoucher(c, 'Journal', '2026-09-11', 'e0000000-0000-0000-0000-000000000020');
await expectError('posting to a group ledger blocked (RPC path)', `SELECT accounting.post_voucher_atomic('e0000000-0000-0000-0000-000000000020', ${lines(L('a0000000-0000-0000-0000-000000005500', 10, 0), L(BANK, 0, 10))})`, 'group');
await expectError('posting to a group ledger blocked (EF path)', `INSERT INTO "JournalEntries" ("Id","TenantId","CompanyId","EntryNumber","Date","Description","SourceType","Status","TotalDebit","TotalCredit","CreatedAt")
   VALUES ('e1000000-0000-0000-0000-000000000020','${TN}','${CO}','JV-TEST-20','2026-09-12','ef','Manual','Draft',10,10,now());
   INSERT INTO "JournalLines" ("Id","TenantId","CompanyId","JournalEntryId","AccountId","Debit","Credit","IsReconciled","CreatedAt") VALUES (gen_random_uuid(),'${TN}','${CO}','e1000000-0000-0000-0000-000000000020','a0000000-0000-0000-0000-000000005500',10,0,false,now())`, 'group');

// --- contacts / tax rates / products columns
await expectError('bad TRN rejected', `INSERT INTO "Contacts" ("Id","TenantId","CompanyId","Code","Name","ContactType","IsActive","TaxNumber","CreatedAt","OutstandingBalance","PaymentTermDays")
  VALUES (gen_random_uuid(),'${TN}','${CO}','C-1','Bad TRN','Customer',true,'12345','2026-01-01',0,0)`, 'TrnFormat');
await expectOk('15-digit TRN accepted', `INSERT INTO "Contacts" ("Id","TenantId","CompanyId","Code","Name","ContactType","IsActive","TaxNumber","CreatedAt","OutstandingBalance","PaymentTermDays")
  VALUES ('c1000000-0000-0000-0000-000000000001','${TN}','${CO}','C-2','Good TRN','Customer',true,'100123456700003','2026-01-01',0,0)`);
await expectOk('non-AE contact may carry a foreign VAT id', `INSERT INTO "Contacts" ("Id","TenantId","CompanyId","Code","Name","ContactType","IsActive","TaxNumber","Country","CreatedAt","OutstandingBalance","PaymentTermDays")
  VALUES (gen_random_uuid(),'${TN}','${CO}','C-3','UK Ltd','Supplier',true,'GB123456789','GB','2026-01-01',0,0)`);
await expectError('bad tax treatment rejected', `UPDATE "Contacts" SET "TaxTreatment"='Weird' WHERE "Code"='C-2'`, 'TaxTreatment');
await expectError('negative credit limit rejected', `UPDATE "Contacts" SET "CreditLimit"=-1 WHERE "Code"='C-2'`, 'CreditLimit');
const { rows: [c2] } = await c.query(`SELECT "CreditLimit","TaxTreatment","Country" FROM "Contacts" WHERE "Code"='C-2'`);
ok('contact enrichment defaults (CreditLimit 0, Registered/AE)', Number(c2.CreditLimit) === 0 && c2.Country === 'AE' && ['Registered','Unregistered'].includes(c2.TaxTreatment), JSON.stringify(c2));
const cols = (await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE (table_name,column_name) IN
  (('Products','ItemType'),('Products','PurchaseAccountId'),('TaxRates','FtaCode'),('TaxRates','IsDefault'),('AccountingSettings','IsFreeZone'),('AccountingSettings','DecimalPlaces'),('Accounts','NameAr'),('Accounts','DefaultTaxRateId'))`)).rows;
ok('all enrichment columns present', cols.length === 8, JSON.stringify(cols));

// --- period close
const AUG = 'f1000000-0000-0000-0000-000000000008', SEP = 'f1000000-0000-0000-0000-000000000009', OCT = 'f1000000-0000-0000-0000-000000000010';
ok('legacy IsClosed=true synced to HardClosed', (await c.query(`SELECT "CloseStatus","ClosedAt" FROM "FiscalPeriods" WHERE "Id"=$1`, [AUG])).rows[0].CloseStatus === 'HardClosed');
await expectError('bad status rejected', `SELECT accounting.set_period_close_status('${SEP}','Locked')`, 'CloseStatus|invalid|Open, SoftClosed');
await expectError('hard-close out of order rejected', `SELECT accounting.set_period_close_status('${OCT}','HardClosed')`, 'earlier periods');
await expectOk('soft close Sep', `SELECT accounting.set_period_close_status('${SEP}','SoftClosed')`);
ok('soft close sets IsClosed for EF PeriodGuard parity', (await c.query(`SELECT "IsClosed","ClosedBy" FROM "FiscalPeriods" WHERE "Id"=$1`, [SEP])).rows[0].IsClosed === true);
await expectOk('admin may post into soft-closed', `SELECT accounting.assert_period_open('${SEP}')`);
await ctx(3);
await expectError('manager may NOT post into soft-closed', `SELECT accounting.assert_period_open('${SEP}')`, 'soft-closed');
await expectError('manager may not change close status', `SELECT accounting.set_period_close_status('${SEP}','Open')`, 'administrator');
await ctx(2);
await expectError('nobody posts into hard-closed', `SELECT accounting.assert_period_open('${AUG}')`, 'closed');
await expectOk('reopen Sep', `SELECT accounting.set_period_close_status('${SEP}','Open')`);
const { rows: [sep] } = await c.query(`SELECT "IsClosed","ClosedAt","ClosedBy" FROM "FiscalPeriods" WHERE "Id"=$1`, [SEP]);
ok('reopen clears IsClosed/ClosedAt/ClosedBy', sep.IsClosed === false && sep.ClosedAt === null && sep.ClosedBy === null);
await expectOk('EF path: IsClosed=true → HardClosed', `UPDATE "FiscalPeriods" SET "IsClosed"=true WHERE "Id"='${OCT}'`);
ok('…status synced', (await c.query(`SELECT "CloseStatus" FROM "FiscalPeriods" WHERE "Id"=$1`, [OCT])).rows[0].CloseStatus === 'HardClosed');
await c.query(`UPDATE "FiscalPeriods" SET "IsClosed"=false WHERE "Id"=$1`, [OCT]);
ok('…and back to Open', (await c.query(`SELECT "CloseStatus" FROM "FiscalPeriods" WHERE "Id"=$1`, [OCT])).rows[0].CloseStatus === 'Open');

await finish();
