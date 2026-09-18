// 0004 — import_bank_statement / suggest_bank_matches / confirm / unmatch / ignore / RLS.
import { connect, harness, ensureAppRole, IDS } from './_client.mjs';
const c = await connect();
const { ok, expectError, ctx, finish } = harness(c);
const { TN, CO, BANK, CASH, RENT } = IDS;
const BA = 'ba000000-0000-0000-0000-000000000001';
await ctx();

await c.query(`INSERT INTO "BankAccounts" ("Id","TenantId","CompanyId","Name","AccountId","BankName","AccountNumber","IsActive","CreatedAt")
  VALUES ($1,$2,$3,'ENBD Current',$4,'ENBD','1012345678901',true,now()) ON CONFLICT DO NOTHING`, [BA, TN, CO, BANK]);
await c.query(`INSERT INTO "BankMatchRules" ("TenantId","CompanyId","RuleName","Pattern","TargetAccountId","TargetVoucherType","Priority")
  VALUES ($1,$2,'DEWA bills','DEWA|ELECTRIC',$3,'Payment',10) ON CONFLICT DO NOTHING`, [TN, CO, RENT]);

// the contra from test_0003 credited BANK 100 on 2027-03-10 (still Posted)
const { rows: [led] } = await c.query(`SELECT l."Id", e."Date"::date AS d FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id"=l."JournalEntryId"
  WHERE l."AccountId"=$1 AND l."Credit"=100 AND e."Status"='Posted' AND e."VoucherId"='e0000000-0000-0000-0000-000000000012' LIMIT 1`, [BANK]);
ok('ledger line to match found', !!led);
const d = led.d.toISOString().slice(0, 10);

const lines = [
  { line_date: d, description: 'RENT TRANSFER TO LANDLORD', reference: 'TRF001', debit: 100, credit: 0, balance: 95000, raw_data: { Date: d, Description: 'RENT TRANSFER TO LANDLORD' } },
  { line_date: d, description: 'DEWA ELECTRICITY BILL 09/26', reference: 'DDA-77', debit: 320.5, credit: 0 },
  { line_date: d, description: 'SALARY WPS', debit: 12000, credit: 0 },
  { line_date: d, description: 'CUSTOMER DEPOSIT', credit: 8000, debit: 0 },
];
const { rows: [r1] } = await c.query(`SELECT * FROM accounting.import_bank_statement($1,'enbd_sep.csv','enbd',$2::jsonb)`, [BA, JSON.stringify(lines)]);
ok('import: 4 imported, 0 skipped', r1.lines_imported === 4 && r1.lines_skipped === 0, JSON.stringify(r1));
const { rows: [st] } = await c.query(`SELECT * FROM "BankStatements" WHERE "Id"=$1`, [r1.statement_id]);
ok('statement totals + Completed', Number(st.TotalDebits) === 12420.5 && Number(st.TotalCredits) === 8000 && st.LineCount === 4 && st.ImportStatus === 'Completed', JSON.stringify(st));
ok('audit CreatedBy from session context', st.CreatedBy === IDS.U);

const { rows: bl } = await c.query(`SELECT * FROM "BankStatementLines" WHERE "StatementId"=$1 ORDER BY "LineNumber"`, [r1.statement_id]);
ok('exact ledger match auto-suggested', bl[0].MatchStatus === 'Suggested' && bl[0].MatchedJournalLineId === led.Id && bl[0].MatchedVoucherId === 'e0000000-0000-0000-0000-000000000012');
ok('regex rule suggested account', bl[1].MatchStatus === 'Suggested' && bl[1].SuggestedAccountId === RENT && bl[1].MatchRuleId);
ok('unmatched line stays Unmatched', bl[2].MatchStatus === 'Unmatched');
ok('raw_data preserved', bl[0].RawData?.Description === 'RENT TRANSFER TO LANDLORD');
const { rows: [rule] } = await c.query(`SELECT "TimesUsed","LastUsedAt" FROM "BankMatchRules" WHERE "RuleName"='DEWA bills'`);
ok('rule usage counted', rule.TimesUsed === 1 && rule.LastUsedAt);

const { rows: [r2] } = await c.query(`SELECT * FROM accounting.import_bank_statement($1,'again.csv','enbd',$2::jsonb)`, [BA, JSON.stringify(lines.slice(0, 3).concat([{ line_date: d, description: 'NEW LINE', credit: 1, debit: 0 }]))]);
ok('re-import skips fingerprint duplicates', r2.lines_imported === 1 && r2.lines_skipped === 3, JSON.stringify(r2));
const { rows: [st2] } = await c.query(`SELECT "ImportStatus","ImportErrors" FROM "BankStatements" WHERE "Id"=$1`, [r2.statement_id]);
ok('PartiallyCompleted + errors json', st2.ImportStatus === 'PartiallyCompleted' && st2.ImportErrors.duplicates_skipped === 3);

await expectError('empty import rejected', `SELECT accounting.import_bank_statement('${BA}','x.csv','enbd','[]'::jsonb)`, 'no lines');
await expectError('unknown bank account', `SELECT accounting.import_bank_statement('00000000-0000-0000-0000-000000000000','x.csv','enbd','[{"line_date":"2026-09-01","description":"x","debit":1,"credit":0}]'::jsonb)`, 'not found');
await expectError('both sides on a line rejected', `INSERT INTO "BankStatementLines" ("TenantId","CompanyId","StatementId","BankAccountId","LineDate","Description","Debit","Credit") VALUES ('${TN}','${CO}','${r1.statement_id}','${BA}','2026-09-01','x',1,1)`, 'OneSide');

await expectError('confirm with wrong amount rejected', `SELECT accounting.confirm_bank_match('${bl[2].Id}','${led.Id}')`, 'do not agree');
await c.query(`SELECT accounting.confirm_bank_match($1,$2)`, [bl[0].Id, led.Id]);
const { rows: [jl] } = await c.query(`SELECT "IsReconciled" FROM "JournalLines" WHERE "Id"=$1`, [led.Id]);
const { rows: [m] } = await c.query(`SELECT "MatchStatus","MatchedAt","MatchedBy" FROM "BankStatementLines" WHERE "Id"=$1`, [bl[0].Id]);
ok('confirm → JournalLines.IsReconciled (Xorva bank rec stays valid)', jl.IsReconciled === true);
ok('confirm → Matched with audit', m.MatchStatus === 'Matched' && m.MatchedAt && m.MatchedBy === IDS.U);
await expectError('double confirm rejected', `SELECT accounting.confirm_bank_match('${bl[0].Id}','${led.Id}')`, 'already matched');
await expectError('reconciled ledger line cannot be reused', `SELECT accounting.confirm_bank_match('${bl[2].Id}','${led.Id}')`, 'already reconciled|do not agree');
const { rows: [cashLine] } = await c.query(`SELECT l."Id" FROM "JournalLines" l JOIN "JournalEntries" e ON e."Id"=l."JournalEntryId" WHERE l."AccountId"=$1 AND l."Debit"=100 AND e."Status"='Posted' LIMIT 1`, [CASH]);
await c.query(`UPDATE "BankStatementLines" SET "Debit"=0,"Credit"=100 WHERE "Id"=$1`, [bl[2].Id]);
await expectError('ledger line on a different GL rejected', `SELECT accounting.confirm_bank_match('${bl[2].Id}','${cashLine.Id}')`, 'ledger account');

await c.query(`SELECT accounting.unmatch_bank_line($1)`, [bl[0].Id]);
const { rows: [jl2] } = await c.query(`SELECT "IsReconciled" FROM "JournalLines" WHERE "Id"=$1`, [led.Id]);
const { rows: [m2] } = await c.query(`SELECT "MatchStatus","MatchedJournalLineId" FROM "BankStatementLines" WHERE "Id"=$1`, [bl[0].Id]);
ok('unmatch → unreconciled + Unmatched', jl2.IsReconciled === false && m2.MatchStatus === 'Unmatched' && m2.MatchedJournalLineId === null);
await c.query(`SELECT accounting.ignore_bank_line($1)`, [bl[3].Id]);
ok('ignore', (await c.query(`SELECT "MatchStatus" FROM "BankStatementLines" WHERE "Id"=$1`, [bl[3].Id])).rows[0].MatchStatus === 'Ignored');

await ensureAppRole(c);
const a = await connect('xorva_app');
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${IDS.CO2}',2,false)`);
ok('RLS: other company sees 0 bank lines', Number((await a.query(`SELECT count(*) n FROM "BankStatementLines"`)).rows[0].n) === 0);
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${CO}',2,false)`);
ok('RLS: own company sees 5 bank lines', Number((await a.query(`SELECT count(*) n FROM "BankStatementLines"`)).rows[0].n) === 5);
await a.end();
await c.query(`DELETE FROM "BankStatements" WHERE "Id"=$1`, [r2.statement_id]);
ok('delete statement cascades lines', Number((await c.query(`SELECT count(*) n FROM "BankStatementLines"`)).rows[0].n) === 4);

await finish();
