import { NextRequest, NextResponse } from "next/server";
import {
  getBalanceSheet,
  getLedgerStatement,
  getTransactionRegister,
} from "@/lib/actions/reports";
import { generateReportXLSX } from "@/lib/reports/xlsx-generator";
import { generateReportPDF } from "@/lib/reports/pdf-generator";
import type { ExportFormat, ReportFilters, ReportType } from "@/lib/reports/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportType, format, filters = {} } = body as {
      reportType: ReportType;
      format: ExportFormat;
      filters: ReportFilters;
    };

    if (!reportType || !["balance_sheet", "ledger", "transactions"].includes(reportType)) {
      return NextResponse.json(
        { error: "Invalid or missing reportType. Must be balance_sheet, ledger, or transactions." },
        { status: 400 }
      );
    }

    if (!format || !["pdf", "xlsx"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid or missing format. Must be pdf or xlsx." },
        { status: 400 }
      );
    }

    // Fetch data based on report type (auth and tenant verification enforced inside server actions)
    let data: any;
    let filenamePrefix = "Report";

    if (reportType === "balance_sheet") {
      data = await getBalanceSheet(filters.asOf);
      filenamePrefix = `Balance_Sheet_${data.asOf}`;
    } else if (reportType === "ledger") {
      if (!filters.accountId) {
        return NextResponse.json(
          { error: "filters.accountId is required for ledger export." },
          { status: 400 }
        );
      }
      data = await getLedgerStatement(filters);
      const safeAccName = data.accountName.replace(/[^a-zA-Z0-9_-]/g, "_");
      filenamePrefix = `Ledger_${safeAccName}`;
    } else if (reportType === "transactions") {
      data = await getTransactionRegister(filters);
      const todayStr = new Date().toISOString().split("T")[0];
      filenamePrefix = `Transaction_Register_${todayStr}`;
    }

    let fileBuffer: Buffer;
    let contentType: string;
    let fileExtension: string;

    if (format === "xlsx") {
      fileBuffer = generateReportXLSX(reportType, data);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      fileExtension = "xlsx";
    } else {
      fileBuffer = await generateReportPDF(reportType, data);
      contentType = "application/pdf";
      fileExtension = "pdf";
    }

    const filename = `${filenamePrefix}.${fileExtension}`;

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    console.error("Export Engine Error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred during export generation." },
      { status: 500 }
    );
  }
}
