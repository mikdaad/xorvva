-- Minimal Xorva tenant for the SQL tests: 1 tenant, 2 companies, 1 admin user,
-- a 4-account chart, accounting settings, FY2026 (Aug closed, Sep/Oct open),
-- a cost-centre dimension with group + leaf, and one posted Payment voucher.
INSERT INTO "Tenants" ("Id","Name","ContactEmail","IsActive","CreatedAt") VALUES
  ('20000000-0000-0000-0000-000000000001','Test Corp','ceo@test.corp',true,now());
INSERT INTO "Companies" ("Id","TenantId","Name","Currency","Timezone","IsActive","ActiveModules","CreatedAt") VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Alpha LLC','AED','Asia/Dubai',true,'{Accounting}',now()),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Beta LLC','AED','Asia/Dubai',true,'{Accounting}',now());
INSERT INTO "Users" ("Id","Email","FirstName","LastName","PasswordHash","Role","TenantId","CompanyId","IsActive","CreatedAt") VALUES
  ('10000000-0000-0000-0000-000000000001','admin@alpha.test','Ada','Admin','x','CompanyAdmin','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',true,now());

INSERT INTO "Accounts" ("Id","TenantId","CompanyId","Code","Name","AccountType","AccountSubType","NormalBalance","IsSystemAccount","CurrentBalance","IsActive","SortOrder","CreatedAt") VALUES
  ('a0000000-0000-0000-0000-000000001000','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1000','Bank','Asset','Bank','Debit',true,0,true,1,now()),
  ('a0000000-0000-0000-0000-000000001010','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1010','Cash','Asset','Cash','Debit',true,0,true,2,now()),
  ('a0000000-0000-0000-0000-000000005000','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','5000','Rent Expense','Expense','OperatingExpense','Debit',false,0,true,3,now()),
  ('a0000000-0000-0000-0000-000000005900','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','5900','Inactive Exp','Expense','OperatingExpense','Debit',false,0,false,4,now());

INSERT INTO "AccountingSettings" ("Id","TenantId","CompanyId","BaseCurrency","CountryCode","InvoicePrefix","BillPrefix","JournalPrefix","PaymentPrefix",
  "NextInvoiceNumber","NextBillNumber","NextJournalNumber","NextPaymentNumber",
  "ReceivableAccountId","PayableAccountId","SalesAccountId","PurchaseAccountId","VatOutputAccountId","VatInputAccountId","RetainedEarningsAccountId",
  "CashAccountId","DefaultBankAccountId","RoundingAccountId","FxGainLossAccountId","UnrealizedFxGainLossAccountId","SalaryExpenseAccountId","SalaryPayableAccountId","CreatedAt") VALUES
  ('c0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','AED','AE','INV','BILL','JV','PAY',1,1,7,1,
   'a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000',
   'a0000000-0000-0000-0000-000000001010','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000','a0000000-0000-0000-0000-000000001000',now());

INSERT INTO "FiscalYears" ("Id","TenantId","CompanyId","Name","StartDate","EndDate","IsClosed","CreatedAt") VALUES
  ('f0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','FY2026','2026-01-01','2026-12-31',false,now());
INSERT INTO "FiscalPeriods" ("Id","TenantId","CompanyId","FiscalYearId","Name","StartDate","EndDate","IsClosed","CreatedAt") VALUES
  ('f1000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Aug 2026','2026-08-01','2026-08-31',true,now()),
  ('f1000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Sep 2026','2026-09-01','2026-09-30',false,now()),
  ('f1000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Oct 2026','2026-10-01','2026-10-31',false,now());

INSERT INTO "CostCentreDimensions" ("Id","TenantId","CompanyId","Name","Code","DimensionType","IsActive") VALUES
  ('cd000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Project','PRJ','Project',true);
INSERT INTO "CostCentres" ("Id","TenantId","CompanyId","DimensionId","Code","Name","IsGroup","IsActive") VALUES
  ('cc000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cd000000-0000-0000-0000-000000000001','KZ','Khalifa Zone','true',true);
INSERT INTO "CostCentres" ("Id","TenantId","CompanyId","DimensionId","Code","Name","ParentId","IsGroup","IsActive") VALUES
  ('cc000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cd000000-0000-0000-0000-000000000001','KZ-A2000','Tower A2000','cc000000-0000-0000-0000-000000000001',false,true);

SELECT app.set_session_context('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2,false);

-- One posted Payment voucher: rent 5000 paid from bank, tagged to the leaf cost centre.
INSERT INTO "Vouchers" ("Id","TenantId","CompanyId","VoucherType","VoucherNumber","VoucherDate","Narration","TotalAmount","BaseTotalAmount")
VALUES ('e0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Payment',
        accounting.generate_voucher_number('30000000-0000-0000-0000-000000000001','Payment',2026),'2026-09-15','Sept rent',5000,5000);
SELECT accounting.post_voucher_atomic('e0000000-0000-0000-0000-000000000001', '[
  {"account_id":"a0000000-0000-0000-0000-000000005000","base_debit":5000,"base_credit":0,"cost_centre_id":"cc000000-0000-0000-0000-000000000002","description":"Rent"},
  {"account_id":"a0000000-0000-0000-0000-000000001000","base_debit":0,"base_credit":5000,"description":"Bank"}
]'::jsonb);
