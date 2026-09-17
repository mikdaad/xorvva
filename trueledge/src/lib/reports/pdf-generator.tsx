import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  BalanceSheetResult,
  BalanceSheetNode,
  LedgerStatement,
  TransactionRegisterResult,
} from "@/lib/reports/types";
import { formatAmount, formatReportDate } from "@/lib/reports/labels";

// Create PDF Stylesheet
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 15,
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  titleGroup: {
    flexDirection: "column",
  },
  companyName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
  },
  reportTitle: {
    fontSize: 12,
    marginTop: 2,
    color: "#475569",
    fontWeight: "bold",
  },
  metaGroup: {
    textAlign: "right",
    fontSize: 8,
    color: "#64748b",
  },
  filterBadge: {
    fontSize: 8,
    color: "#334155",
    backgroundColor: "#f1f5f9",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  table: {
    width: "100%",
    marginTop: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
    alignItems: "center",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    fontWeight: "bold",
  },
  tableSummaryRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: "#0f172a",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    marginTop: 4,
    fontWeight: "bold",
  },
  th: {
    fontWeight: "bold",
    color: "#0f172a",
  },
  td: {
    color: "#334155",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
  numeric: {
    textAlign: "right",
  },
});

// ---------------------------------------------------------------------------
// 1. Transactions Register PDF Component (Landscape)
// ---------------------------------------------------------------------------

function TransactionsPDF({ data }: { data: TransactionRegisterResult }) {
  const fromStr = data.filters.dateRange?.from
    ? formatReportDate(data.filters.dateRange.from)
    : "Beginning";
  const toStr = data.filters.dateRange?.to
    ? formatReportDate(data.filters.dateRange.to)
    : "Latest";

  return (
    <Document title={`Transaction_Register_${toStr}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.companyName}>{data.entityName}</Text>
            <Text style={styles.reportTitle}>UNIFIED TRANSACTION REGISTER (DAYBOOK)</Text>
          </View>
          <View style={styles.metaGroup}>
            <Text>Period: {fromStr} to {toStr}</Text>
            <Text>Base Currency: {data.baseCurrency}</Text>
            <Text style={styles.filterBadge}>
              Type: {data.filters.voucherType || "All"} | Status: {data.filters.status || "All"}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: "10%" }]}>Date</Text>
            <Text style={[styles.th, { width: "14%" }]}>Voucher No</Text>
            <Text style={[styles.th, { width: "13%" }]}>Type</Text>
            <Text style={[styles.th, { width: "20%" }]}>Party Name</Text>
            <Text style={[styles.th, { width: "18%" }]}>Reference</Text>
            <Text style={[styles.th, { width: "8%" }]}>Status</Text>
            <Text style={[styles.th, { width: "17%", textAlign: "right" }]}>
              Base Amount ({data.baseCurrency})
            </Text>
          </View>

          {data.rows.map((row) => (
            <View key={row.id} style={styles.tableRow}>
              <Text style={[{ width: "10%" }]}>{formatReportDate(row.date)}</Text>
              <Text style={[{ width: "14%", fontWeight: "bold" }]}>{row.voucherNumber}</Text>
              <Text style={[{ width: "13%" }]}>{row.typeLabel}</Text>
              <Text style={[{ width: "20%" }]}>{row.partyName || "—"}</Text>
              <Text style={[{ width: "18%" }]}>{row.reference || "—"}</Text>
              <Text style={[{ width: "8%" }]}>{row.statusLabel}</Text>
              <Text style={[{ width: "17%", textAlign: "right", fontWeight: "bold" }]}>
                {formatAmount(row.baseAmount)}
              </Text>
            </View>
          ))}

          {/* Summary Row */}
          <View style={styles.tableSummaryRow}>
            <Text style={[{ width: "83%", fontWeight: "bold" }]}>
              TOTAL ({data.rows.length} Vouchers)
            </Text>
            <Text style={[{ width: "17%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.totalBaseAmount)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>TrueLedge Accounting Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// 2. Balance Sheet PDF Component (Portrait)
// ---------------------------------------------------------------------------

function BalanceSheetPDF({ data }: { data: BalanceSheetResult }) {
  function renderNodes(nodes: BalanceSheetNode[], depth: number = 0) {
    return nodes.map((n) => (
      <React.Fragment key={n.id}>
        <View style={styles.tableRow}>
          <Text style={[{ width: "20%" }]}>{n.code || ""}</Text>
          <Text style={[{ width: "55%", paddingLeft: depth * 12, fontWeight: n.isGroup ? "bold" : "normal" }]}>
            {n.name}
          </Text>
          <Text style={[{ width: "25%", textAlign: "right", fontWeight: n.isGroup ? "bold" : "normal" }]}>
            {formatAmount(n.amount)}
          </Text>
        </View>
        {n.children && n.children.length > 0 && renderNodes(n.children, depth + 1)}
      </React.Fragment>
    ));
  }

  return (
    <Document title={`Balance_Sheet_${data.asOf}`}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.companyName}>{data.entityName}</Text>
            <Text style={styles.reportTitle}>BALANCE SHEET</Text>
          </View>
          <View style={styles.metaGroup}>
            <Text>As Of: {formatReportDate(data.asOf)}</Text>
            <Text>Base Currency: {data.baseCurrency}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: "20%" }]}>Code</Text>
            <Text style={[styles.th, { width: "55%" }]}>Account / Group Name</Text>
            <Text style={[styles.th, { width: "25%", textAlign: "right" }]}>
              Amount ({data.baseCurrency})
            </Text>
          </View>

          {/* ASSETS */}
          <Text style={styles.sectionTitle}>ASSETS</Text>
          {renderNodes(data.assets.nodes, 0)}
          <View style={styles.tableSummaryRow}>
            <Text style={[{ width: "75%", fontWeight: "bold" }]}>TOTAL ASSETS</Text>
            <Text style={[{ width: "25%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.totalAssets)}
            </Text>
          </View>

          {/* LIABILITIES */}
          <Text style={styles.sectionTitle}>LIABILITIES</Text>
          {renderNodes(data.liabilities.nodes, 0)}
          <View style={styles.tableSummaryRow}>
            <Text style={[{ width: "75%", fontWeight: "bold" }]}>TOTAL LIABILITIES</Text>
            <Text style={[{ width: "25%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.liabilities.total)}
            </Text>
          </View>

          {/* EQUITY */}
          <Text style={styles.sectionTitle}>EQUITY & CAPITAL</Text>
          {renderNodes(data.equity.nodes, 0)}
          <View style={styles.tableSummaryRow}>
            <Text style={[{ width: "75%", fontWeight: "bold" }]}>TOTAL EQUITY</Text>
            <Text style={[{ width: "25%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.equity.total)}
            </Text>
          </View>

          {/* TOTAL LIABILITIES & EQUITY */}
          <View style={[styles.tableSummaryRow, { marginTop: 12, backgroundColor: "#e2e8f0" }]}>
            <Text style={[{ width: "75%", fontWeight: "bold", fontSize: 10 }]}>
              TOTAL LIABILITIES & EQUITY
            </Text>
            <Text style={[{ width: "25%", textAlign: "right", fontWeight: "bold", fontSize: 10 }]}>
              {formatAmount(data.totalLiabilitiesAndEquity)}
            </Text>
          </View>

          {Math.abs(data.difference) > 0.01 && (
            <View style={[styles.tableRow, { backgroundColor: "#fee2e2" }]}>
              <Text style={[{ width: "75%", color: "#991b1b", fontWeight: "bold" }]}>
                UNBALANCED DIFFERENCE
              </Text>
              <Text style={[{ width: "25%", textAlign: "right", color: "#991b1b", fontWeight: "bold" }]}>
                {formatAmount(data.difference)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>TrueLedge Financial Core Engine</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// 3. Ledger Statement PDF Component (Portrait)
// ---------------------------------------------------------------------------

function LedgerPDF({ data }: { data: LedgerStatement }) {
  return (
    <Document title={`Ledger_${data.accountName}`}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.companyName}>{data.entityName}</Text>
            <Text style={styles.reportTitle}>LEDGER STATEMENT: {data.accountName}</Text>
          </View>
          <View style={styles.metaGroup}>
            <Text>Account Code: {data.accountCode || "N/A"}</Text>
            <Text>Period: {formatReportDate(data.from)} to {formatReportDate(data.to)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: "14%" }]}>Date</Text>
            <Text style={[styles.th, { width: "16%" }]}>Entry No</Text>
            <Text style={[styles.th, { width: "34%" }]}>Narration</Text>
            <Text style={[styles.th, { width: "12%", textAlign: "right" }]}>Debit</Text>
            <Text style={[styles.th, { width: "12%", textAlign: "right" }]}>Credit</Text>
            <Text style={[styles.th, { width: "12%", textAlign: "right" }]}>Balance</Text>
          </View>

          {/* Opening Balance Row */}
          <View style={[styles.tableRow, { backgroundColor: "#f8fafc" }]}>
            <Text style={[{ width: "14%" }]}>{formatReportDate(data.from)}</Text>
            <Text style={[{ width: "16%", fontWeight: "bold" }]}>OPENING</Text>
            <Text style={[{ width: "34%" }]}>Opening Balance Brought Forward</Text>
            <Text style={[{ width: "12%", textAlign: "right" }]}>
              {data.openingBalance > 0 ? formatAmount(data.openingBalance) : "—"}
            </Text>
            <Text style={[{ width: "12%", textAlign: "right" }]}>
              {data.openingBalance < 0 ? formatAmount(Math.abs(data.openingBalance)) : "—"}
            </Text>
            <Text style={[{ width: "12%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.openingBalance)}
            </Text>
          </View>

          {data.lines.map((line, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[{ width: "14%" }]}>{formatReportDate(line.date)}</Text>
              <Text style={[{ width: "16%", fontWeight: "bold" }]}>{line.entryNumber}</Text>
              <Text style={[{ width: "34%" }]}>{line.narration || "—"}</Text>
              <Text style={[{ width: "12%", textAlign: "right" }]}>
                {line.debit > 0 ? formatAmount(line.debit) : "—"}
              </Text>
              <Text style={[{ width: "12%", textAlign: "right" }]}>
                {line.credit > 0 ? formatAmount(line.credit) : "—"}
              </Text>
              <Text style={[{ width: "12%", textAlign: "right", fontWeight: "bold" }]}>
                {formatAmount(line.runningBalance)}
              </Text>
            </View>
          ))}

          {/* Summary Row */}
          <View style={styles.tableSummaryRow}>
            <Text style={[{ width: "64%", fontWeight: "bold" }]}>CLOSING BALANCE</Text>
            <Text style={[{ width: "12%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.totalDebit)}
            </Text>
            <Text style={[{ width: "12%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.totalCredit)}
            </Text>
            <Text style={[{ width: "12%", textAlign: "right", fontWeight: "bold" }]}>
              {formatAmount(data.closingBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>TrueLedge Accounting Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Export Function: Buffer Generator
// ---------------------------------------------------------------------------

export async function generateReportPDF(
  reportType: "balance_sheet" | "ledger" | "transactions",
  data: BalanceSheetResult | LedgerStatement | TransactionRegisterResult
): Promise<Buffer> {
  let doc: React.ReactElement<any>;

  if (reportType === "transactions") {
    doc = <TransactionsPDF data={data as TransactionRegisterResult} />;
  } else if (reportType === "balance_sheet") {
    doc = <BalanceSheetPDF data={data as BalanceSheetResult} />;
  } else if (reportType === "ledger") {
    doc = <LedgerPDF data={data as LedgerStatement} />;
  } else {
    throw new Error(`Unsupported PDF report type: ${reportType}`);
  }

  const buffer = await renderToBuffer(doc);
  return buffer;
}
