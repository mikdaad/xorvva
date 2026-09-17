"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getLedgerStatement } from "@/lib/actions/reports";
import type { LedgerStatement } from "@/lib/reports/types";
import { formatMoney, formatReportDate } from "@/lib/reports/labels";
import { ExportMenu } from "@/components/reports/export-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  RefreshCw,
  BookOpen,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

export default function LedgerStatementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountId = searchParams.get("accountId");
  const initialFrom = searchParams.get("from") || "";
  const initialTo = searchParams.get("to") || "";

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const [data, setData] = useState<LedgerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = async () => {
    if (!accountId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getLedgerStatement({
        accountId,
        dateRange: {
          from: from || null,
          to: to || null,
        },
      });
      setData(res);
    } catch (err: any) {
      console.error("Failed to load ledger statement:", err);
      setError(err.message || "Failed to load ledger statement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) {
      loadLedger();
    }
  }, [accountId, from, to]);

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <BookOpen className="h-12 w-12 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-bold">No Ledger Selected</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Please select an account from the Balance Sheet or Chart of Accounts to view its detailed ledger statement.
        </p>
        <Button onClick={() => router.push("/reports/balance-sheet")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Balance Sheet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 sm:p-2">
      {/* Action Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4 border-border">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/reports/balance-sheet")}
              title="Return to Balance Sheet"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              {data ? data.accountName : "Ledger Statement"}
            </h1>
            {data?.accountCode && (
              <Badge variant="outline" className="font-mono text-xs">
                {data.accountCode}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 ml-10">
            {data?.entityName || "Account Ledger History"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date range filters */}
          <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-3 py-1.5 shadow-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-transparent text-xs text-foreground focus:outline-none"
              placeholder="From Date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent text-xs text-foreground focus:outline-none"
              placeholder="To Date"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadLedger}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>

          {data && (
            <ExportMenu
              reportType="ledger"
              filters={{
                accountId,
                dateRange: { from: from || null, to: to || null },
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold">Error Loading Ledger</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Opening Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">
              {data ? formatMoney(data.openingBalance, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Brought Forward</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Period Debit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {data ? formatMoney(data.totalDebit, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Debit Postings</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Period Credit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-amber-400">
              {data ? formatMoney(data.totalCredit, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Credit Postings</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Closing Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-primary">
              {data ? formatMoney(data.closingBalance, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Carried Forward</p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-base font-semibold">Posted Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading ledger transactions...</p>
            </div>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Entry No</th>
                    <th className="py-3 px-4">Narration</th>
                    <th className="py-3 px-4 text-right">Debit</th>
                    <th className="py-3 px-4 text-right">Credit</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Opening balance row */}
                  <tr className="bg-muted/20 font-medium">
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {from ? formatReportDate(from) : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">
                      OPENING
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      Opening Balance Brought Forward
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm">
                      {data.openingBalance > 0 ? formatMoney(data.openingBalance, data.baseCurrency) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm">
                      {data.openingBalance < 0 ? formatMoney(Math.abs(data.openingBalance), data.baseCurrency) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-foreground">
                      {formatMoney(data.openingBalance, data.baseCurrency)}
                    </td>
                  </tr>

                  {data.lines.map((line, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatReportDate(line.date)}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm font-semibold">
                        {line.entryNumber}
                      </td>
                      <td className="py-3 px-4 text-sm text-foreground/90 max-w-xs truncate">
                        {line.narration || "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm text-emerald-400">
                        {line.debit > 0 ? formatMoney(line.debit, data.baseCurrency) : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm text-amber-400">
                        {line.credit > 0 ? formatMoney(line.credit, data.baseCurrency) : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold">
                        {formatMoney(line.runningBalance, data.baseCurrency)}
                      </td>
                    </tr>
                  ))}

                  {/* Summary / Closing Row */}
                  <tr className="bg-muted/50 border-t-2 border-primary/40 font-bold text-sm">
                    <td colSpan={3} className="py-3 px-4 text-foreground">
                      CLOSING BALANCE
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-400">
                      {formatMoney(data.totalDebit, data.baseCurrency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-400">
                      {formatMoney(data.totalCredit, data.baseCurrency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-primary">
                      {formatMoney(data.closingBalance, data.baseCurrency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
