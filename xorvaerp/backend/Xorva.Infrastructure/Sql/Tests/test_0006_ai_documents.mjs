// 0006 — AI document inbox lifecycle: upload → begin → complete/fail → override → accept/reject.
import { connect, harness, ensureAppRole, IDS } from './_client.mjs';
const c = await connect();
const { ok, expectError, expectOk, ctx, finish, near } = harness(c);
const { TN, CO } = IDS;
await ctx();

const pdf = Buffer.from('%PDF-1.4 test');
await expectError('unsupported mime rejected', `SELECT accounting.upload_document('${CO}','x.exe','application/octet-stream','\\x00'::bytea)`, 'Unsupported file type');
await expectError('unknown company rejected', `SELECT accounting.upload_document('00000000-0000-0000-0000-000000000009','x.pdf','application/pdf','\\x00'::bytea)`, 'not found');
const { rows: [{ upload_document: doc }] } = await c.query(`SELECT accounting.upload_document($1,'inv-001.pdf','application/pdf',$2,'PurchaseInvoice',ARRAY['dewa'])`, [CO, pdf]);
const { rows: [d] } = await c.query(`SELECT d.*, f."Size", f."Data" FROM "AccountingDocuments" d JOIN "AccountingDocumentFiles" f ON f."Id"=d."FileId" WHERE d."Id"=$1`, [doc]);
ok('upload stores bytes + Pending row with tags/audit', d.Status === 'Pending' && Number(d.Size) === pdf.length && d.Data.equals(pdf) && d.Tags[0] === 'dewa' && d.UploadedBy === IDS.U && d.TenantId === TN, JSON.stringify({ ...d, Data: undefined }));

await expectError('Pending → Extracted illegal', `UPDATE "AccountingDocuments" SET "Status"='Extracted' WHERE "Id"='${doc}'`, 'Invalid document status transition');
await expectError('complete before begin rejected', `SELECT accounting.complete_document_extraction('${doc}','{}'::jsonb)`, 'not being processed');
await c.query(`SELECT accounting.begin_document_extraction($1)`, [doc]);
ok('begin → Processing', (await c.query(`SELECT "Status" FROM "AccountingDocuments" WHERE "Id"=$1`, [doc])).rows[0].Status === 'Processing');
await expectError('double begin rejected', `SELECT accounting.begin_document_extraction('${doc}')`, 'already being processed');

await c.query(`SELECT accounting.fail_document_extraction($1,'Gemini timeout')`, [doc]);
const { rows: [f] } = await c.query(`SELECT "Status","StatusMessage" FROM "AccountingDocuments" WHERE "Id"=$1`, [doc]);
ok('fail → Failed with message', f.Status === 'Failed' && f.StatusMessage === 'Gemini timeout');
await c.query(`SELECT accounting.begin_document_extraction($1)`, [doc]);
ok('retry from Failed allowed, message cleared', (await c.query(`SELECT "Status","StatusMessage" FROM "AccountingDocuments" WHERE "Id"=$1`, [doc])).rows[0].StatusMessage === null);

const extracted = {
  supplier_name: 'DEWA', supplier_trn: '100000000000003', buyer_name: 'Alpha LLC', buyer_trn: null,
  invoice_number: 'INV-778', invoice_date: '2026-09-01', due_date: '2026-09-30', currency: 'AED', place_of_supply: 'Dubai',
  subtotal: 1000, tax_total: 50, grand_total: 1050, overall_confidence: 0.91, page_count: 2,
  field_confidence: { supplier_name: 0.99, invoice_number: 0.7, totals: 0.95 },
  line_items: [{ description: 'Electricity', amount: 800, confidence: 0.9 }, { description: 'Water', amount: 200 }],
};
const { rows: [{ complete_document_extraction: ext }] } = await c.query(`SELECT accounting.complete_document_extraction($1,$2::jsonb,$3::jsonb,'gemini-2.5-flash','2025-06',1234)`, [doc, JSON.stringify(extracted), JSON.stringify({ raw: true })]);
const { rows: [e] } = await c.query(`SELECT * FROM "DocumentExtractions" WHERE "Id"=$1`, [ext]);
ok('extraction row: model, confidence clamp, raw + extracted json', e.ModelUsed === 'gemini-2.5-flash' && near(e.ConfidenceScore, 0.91) && e.ProcessingTimeMs === 1234 && e.RawResponse.raw === true && e.ExtractedData.grand_total === 1050);
const { rows: [d2] } = await c.query(`SELECT "Status","ProcessedAt","PageCount" FROM "AccountingDocuments" WHERE "Id"=$1`, [doc]);
ok('document → Extracted, ProcessedAt, PageCount', d2.Status === 'Extracted' && d2.ProcessedAt && d2.PageCount === 2);
const { rows: sug } = await c.query(`SELECT "FieldName","FieldGroup","ExtractedValue","Confidence","FinalValue" FROM "DocumentFieldSuggestions" WHERE "ExtractionId"=$1 ORDER BY "FieldName"`, [ext]);
ok('12 header/total + 4 line-item suggestions', sug.length === 16, String(sug.length));
const by = Object.fromEntries(sug.map(s => [s.FieldName, s]));
ok('per-field confidence used when present', near(by.supplier_name.Confidence, 0.99) && near(by.invoice_number.Confidence, 0.7) && near(by.subtotal.Confidence, 0.95));
ok('overall confidence used as fallback', near(by.currency.Confidence, 0.91) && near(by['line_items[1].amount'].Confidence, 0.91));
ok('FinalValue defaults to extracted value; null stays null', by.grand_total.FinalValue === '1050' && by.buyer_trn.FinalValue === null && by.buyer_trn.ExtractedValue === null);

await c.query(`SELECT accounting.override_document_field($1,'invoice_number','INV-0778')`, [ext]);
const { rows: [ov] } = await c.query(`SELECT "UserOverride","FinalValue","ExtractedValue","UpdatedBy" FROM "DocumentFieldSuggestions" WHERE "ExtractionId"=$1 AND "FieldName"='invoice_number'`, [ext]);
ok('override → FinalValue, keeps extracted, audits', ov.UserOverride === 'INV-0778' && ov.FinalValue === 'INV-0778' && ov.ExtractedValue === 'INV-778' && ov.UpdatedBy === IDS.U);
await expectError('override unknown field', `SELECT accounting.override_document_field('${ext}','nope','x')`, 'not found');

await expectError('accept with foreign voucher rejected', `SELECT accounting.accept_document_extraction('${ext}','00000000-0000-0000-0000-000000000001')`, 'Voucher not found');
await expectError('accept requires voucher (trigger)', `UPDATE "AccountingDocuments" SET "Status"='Accepted' WHERE "Id"='${doc}'`, 'together with the voucher');
const V = 'e0000000-0000-0000-0000-000000000001';
await expectOk('accept links voucher', `SELECT accounting.accept_document_extraction('${ext}','${V}')`);
const { rows: [acc] } = await c.query(`SELECT d."Status", d."CreatedVoucherId", x."IsAccepted", x."AcceptedBy", x."CreatedVoucherId" xv FROM "AccountingDocuments" d JOIN "DocumentExtractions" x ON x."DocumentId"=d."Id" WHERE d."Id"=$1`, [doc]);
ok('accepted state on doc + extraction', acc.Status === 'Accepted' && acc.CreatedVoucherId === V && acc.IsAccepted === true && acc.AcceptedBy === IDS.U && acc.xv === V);
await expectError('accepted extraction frozen', `SELECT accounting.override_document_field('${ext}','currency','USD')`, 'already been accepted');
await expectError('accepted document terminal', `SELECT accounting.reject_document('${doc}','changed my mind')`, 'accepted document|cannot change');
await expectError('double accept', `SELECT accounting.accept_document_extraction('${ext}','${V}')`, 'already accepted');

const { rows: [{ upload_document: doc2 }] } = await c.query(`SELECT accounting.upload_document($1,'scan.jpg','image/jpeg',$2)`, [CO, pdf]);
await expectOk('reject pending doc', `SELECT accounting.reject_document('${doc2}','not an invoice')`);
ok('rejected with reason', (await c.query(`SELECT "Status","StatusMessage" FROM "AccountingDocuments" WHERE "Id"=$1`, [doc2])).rows[0].StatusMessage === 'not an invoice');
await expectError('file with document cannot be deleted', `DELETE FROM "AccountingDocumentFiles" WHERE "Id"=(SELECT "FileId" FROM "AccountingDocuments" WHERE "Id"='${doc2}')`, 'violates foreign key|restrict');

await ensureAppRole(c);
const a = await connect('xorva_app');
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${IDS.CO2}',2,false)`);
ok('RLS: other company sees no documents/files/suggestions', Number((await a.query(`SELECT (SELECT count(*) FROM "AccountingDocuments")+(SELECT count(*) FROM "AccountingDocumentFiles")+(SELECT count(*) FROM "DocumentFieldSuggestions") n`)).rows[0].n) === 0);
await a.query(`SELECT app.set_session_context('${IDS.U}','${TN}','${CO}',2,false)`);
ok('RLS: own company sees 2 documents', Number((await a.query(`SELECT count(*) n FROM "AccountingDocuments"`)).rows[0].n) === 2);
await a.end();
await finish();
