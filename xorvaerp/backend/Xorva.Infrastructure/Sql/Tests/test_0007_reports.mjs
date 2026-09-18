// 0007 — report RPCs. Ledger state after earlier tests:
//   PV-2026-00001 (Sep 15): Rent 5000 DR / Bank 5000 CR  → Voided by reversal (Sep 20) Bank 5000 DR / Rent 5000 CR
//   Contra (2027-03-10):   Cash 100 DR / Bank 100 CR
//   JV-TEST-2 (Sep 12):    Rent 50 / Bank 50, Voided in-place by test_0003 (no reversal → still counts, like Xorva C#)
import { connect, harness, IDS, near } from './_client.mjs';
const c = await connect();
const { ok, expectError, ctx, finish } = harness(c);
const { TN, CO, BANK, CASH, RENT } = IDS;
await ctx();
const j = async (sql, p = []) => Object.values((await c.query(sql, p)).rows[0])[0];

// --- consistency with Accounts.CurrentBalance (Xorva's cache) — the invariant the C# reports rely on
const tb = (await c.query(`SELECT * FROM accounting.get_trial_balance()`)).rows;
const cur = Object.fromEntries((await c.query(`SELECT "Code","CurrentBalance" FROM "Accounts" WHERE "CompanyId"=$1`, [CO])).rows.map(r => [r.Code, Number(r.CurrentBalance)]));
const tbNet = Object.fromEntries(tb.map(r => [r.code, Number(r.closing_debit) - Number(r.closing_credit)]));
ok('trial balance closing == Accounts.CurrentBalance for every account', ['1000', '1010', '5000'].every(k => near(tbNet[k], cur[k])), JSON.stringify({ tbNet, cur }));
ok('trial balance balances', near(tb.reduce((s, r) => s + Number(r.closing_debit) - Number(r.closing_credit), 0), 0));
ok('accounts without lines omitted; groups flagged', !tb.some(r => r.code === '5900') && tb.every(r => typeof r.is_group === 'boolean'));
const tbSep = (await c.query(`SELECT * FROM accounting.get_trial_balance(NULL,'2026-09-01','2026-09-30')`)).rows;
const bankSep = tbSep.find(r => r.code === '1000');
ok('period split: opening/period/closing', bankSep && near(bankSep.opening_debit, 0) && near(bankSep.period_debit, 5000) && near(bankSep.period_credit, 5050), JSON.stringify(bankSep));

// --- ledger statement
const ls = await j(`SELECT accounting.get_ledger_statement($1,'2026-09-13','2026-09-30')`, [BANK]);
ok('statement header fields (camelCase)', ls.accountCode === '1000' && ls.entityName === 'Alpha LLC' && ls.normalBalance === 'Debit' && ls.baseCurrency === 'AED', JSON.stringify(Object.keys(ls)));
ok('opening balance = movements before from (-50 from JV-TEST-2)', near(ls.openingBalance, -50), String(ls.openingBalance));
ok('lines carry voucher + entry refs and running balance', ls.lines.length === 2 && ls.lines[0].voucherNumber === 'PV-2026-00001' && near(ls.lines[0].runningBalance, -5050) && near(ls.lines[1].runningBalance, -50), JSON.stringify(ls.lines));
ok('closing = opening + net', near(ls.closingBalance, -50) && near(ls.totalDebit, 5000) && near(ls.totalCredit, 5000));
const lsCC = await j(`SELECT accounting.get_ledger_statement($1,NULL,NULL,$2)`, [RENT, IDS.CC_LEAF]);
ok('cost-centre filter on statement (reversal keeps the cost centre)', lsCC.lines.length === 2 && near(lsCC.lines[0].debit, 5000) && near(lsCC.lines[1].credit, 5000) && lsCC.lines[0].costCentre === 'Tower A2000' && near(lsCC.closingBalance, 0), JSON.stringify(lsCC.lines));
await expectError('statement for unknown account', `SELECT accounting.get_ledger_statement('00000000-0000-0000-0000-000000000000')`, 'not found');

// --- balance sheet
const bs = await j(`SELECT accounting.get_balance_sheet(NULL,'2026-09-30')`);
ok('balance sheet balances (assets = liab + equity)', near(bs.difference, 0) && near(bs.totalAssets, -50), JSON.stringify({ a: bs.totalAssets, le: bs.totalLiabilitiesAndEquity, re: bs.retainedEarnings }));
ok('retained earnings node = -expenses (rent 50 net)', near(bs.retainedEarnings, -50) && bs.equity.nodes.at(-1).id === 'retained-earnings-node');
ok('zero accounts filtered from tree', !JSON.stringify(bs.assets.nodes).includes('"5900"') && bs.assets.nodes.some(n => n.code === '1000' && n.drillAccountId === BANK));
const bs2 = await j(`SELECT accounting.get_balance_sheet(NULL,'2027-12-31')`);
ok('later as-of picks up contra', bs2.assets.nodes.some(n => n.code === '1010' && near(n.amount, 100)));

// --- transaction register
const reg = (await c.query(`SELECT * FROM accounting.get_transaction_register()`)).rows;
ok('register lists all vouchers with window totals', reg.length >= 4 && Number(reg[0].total_count) === reg.length && reg.every(r => Number(r.total_count) === reg.length));
ok('register joins entry number + creator', reg.find(r => r.voucher_number === 'PV-2026-00001')?.entry_number === 'JV-2026-0007' && reg[0].created_by_name === 'Ada Admin');
const regP = (await c.query(`SELECT * FROM accounting.get_transaction_register(NULL,NULL,NULL,'Payment','Reversed')`)).rows;
ok('type + status filter', regP.length === 1 && regP[0].status === 'Reversed');
const regS = (await c.query(`SELECT * FROM accounting.get_transaction_register(NULL,NULL,NULL,'all','all',NULL,'rent')`)).rows;
ok('search on narration', regS.length >= 1 && regS.every(r => /rent/i.test(r.narration ?? '') || /rent/i.test(r.reference ?? '')));
const pg1 = (await c.query(`SELECT voucher_number FROM accounting.get_transaction_register(NULL,NULL,NULL,NULL,NULL,NULL,NULL,2,0)`)).rows;
const pg2 = (await c.query(`SELECT voucher_number FROM accounting.get_transaction_register(NULL,NULL,NULL,NULL,NULL,NULL,NULL,2,2)`)).rows;
ok('paging', pg1.length === 2 && pg2.length >= 1 && pg1[0].voucher_number !== pg2[0].voucher_number);

// --- cost centre report
const ccr = (await c.query(`SELECT * FROM accounting.get_cost_centre_report()`)).rows;
const grp = ccr.find(r => r.code === 'KZ'), leaf = ccr.find(r => r.code === 'KZ-A2000');
ok('cost centre report: leaf 5000/5000 (posted + reversal), group rolls up, levels int', near(leaf.debit, 5000) && near(leaf.credit, 5000) && near(grp.debit, 5000) && grp.level === 1 && leaf.level === 2 && Number(leaf.line_count) === 2, JSON.stringify(ccr));

// --- bank rec summary
const BA = 'ba000000-0000-0000-0000-000000000001';
const br = await j(`SELECT accounting.get_bank_reconciliation_summary($1,'2027-12-31')`, [BA]);
ok('bank rec summary: ledger vs statement counts', br.bankAccountName === 'ENBD Current' && near(br.ledgerBalance, -150) && br.statementLines === 4 && br.ignored === 1 && br.unmatched >= 2, JSON.stringify(br));
await expectError('bank rec summary unknown account', `SELECT accounting.get_bank_reconciliation_summary('00000000-0000-0000-0000-000000000000')`, 'not found');

// --- company scoping
await ctx(2, IDS.CO2);
await expectError('report for a company outside the session scope', `SELECT accounting.get_balance_sheet('${CO}')`, 'access|scope|not permitted');
ok('scoped register for other company empty', (await c.query(`SELECT * FROM accounting.get_transaction_register()`)).rows.length === 0);
await ctx(1, IDS.CO2, true);
ok('CEO cross-company may query any company', (await j(`SELECT accounting.get_balance_sheet('${CO}','2026-09-30')`)).entityName === 'Alpha LLC');
const cons = await j(`SELECT accounting.get_balance_sheet(NULL,'2026-09-30')`);
ok('CEO + NULL company = consolidated (ResolveReportScope parity)', cons.entityId === null && /consolidated/.test(cons.entityName) && near(cons.difference, 0), JSON.stringify(cons).slice(0, 200));

await finish();
