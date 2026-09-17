"use client";

import React, { useState, useEffect } from "react";
import { getTransactionRegister } from "@/lib/actions/reports";
import type { TransactionRegisterResult } from "@/lib/reports/types";
import { formatMoney, formatReportDate, VOUCHER_STATUS_OPTIONS, VOUCHER_TYPE_OPTIONS } from "@/lib/reports/labels";
import { ExportMenu } from "@/components/reports/export-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VoucherStatus, VoucherType } from "@/types/database.types";
import {
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
  Search,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

function statusBadge(status: VoucherStatus) {
  const variants: Record<VoucherStatus, { className: string; label: string }> = {
    draft: { className: "bg-slate-500/15 text-slate-400 border-slate-500/30", label: "Draft" },
    submitted: { className: "bg-sky-500/15 text-sky-400 border-sky-500/30", label: "Submitted" },
    posted: { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Posted" },
    reversed: { className: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Reversed" },
    cancelled: { className: "bg-red-500/15 text-red-400 border-red-500/30", label: "Cancelled" },
  };

  const v = variants[status] || { className: "bg-muted text-muted-foreground", label: status };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

export default function VoucherRegisterPage() {
  const [voucherType, setVoucherType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [data, setData] = useState<TransactionRegisterResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getTransactionRegister({
        voucherType: voucherType as any,
        status: status as any,
        dateRange: {
          from: fromDate || null,
          to: toDate || null,
        },
      });
      setData(res);
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
      setError(err.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [voucherType, status, fromDate, toDate]);

  // Client-side search filtering by voucher number, party name, or reference
  const filteredRows = (data?.rows || []).filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.voucherNumber.toLowerCase().includes(q) ||
      (row.partyName && row.partyName.toLowerCase().includes(q)) ||
      (row.reference && row.reference.toLowerCase().includes(q)) ||
      row.typeLabel.toLowerCase().includes(q)
    );
  });

  const draftCount = (data?.rows || []).filter((r) => r.status === "draft").length;
  const postedCount = (data?.rows || []).filter((r) => r.status === "posted").length;

  return (
    <div className="space-y-6 p-1 sm:p-2">
      {/* Header bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4 border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Voucher Register (Daybook)</h1>
            {data && <Badge variant="outline">{data.baseCurrency}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.entityName || "Unified Transaction Register"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadTransactions}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>

          {/* Export Engine Integration */}
          <ExportMenu
            reportType="transactions"
            filters={{
              voucherType: voucherType as any,
              status: status as any,
              dateRange: { from: fromDate || null, to: toDate || null },
            }}
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Transactions
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.rows.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {draftCount} draft · {postedCount} posted
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Posted Value
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {data ? formatMoney(data.totalBaseAmount, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Base currency total</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Drafts
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {draftCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval / posting</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Control Panel */}
      <Card className="border-border">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Voucher Type Dropdown */}
            <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-2.5 py-1.5 shadow-sm text-xs">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Type:</span>
              <select
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">All Types</option>
                {VOUCHER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-2.5 py-1.5 shadow-sm text-xs">
              <span className="text-muted-foreground font-medium">Status:</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                {VOUCHER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-2.5 py-1.5 shadow-sm text-xs">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search voucher # or party..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold">Error Loading Transactions</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Transaction Register Data Table */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Voucher List</CardTitle>
            <span className="text-xs text-muted-foreground">
              Showing {filteredRows.length} of {data?.rows.length ?? 0} transactions
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Fetching transaction register...</p>
            </div>
          ) : filteredRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Voucher No</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Party Name</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Base Amount ({data?.baseCurrency})</th>
                    <th className="py-3 px-4">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatReportDate(v.date)}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm font-semibold text-foreground">
                        {v.voucherNumber}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs font-normal">
                          {v.typeLabel}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-foreground/90 font-medium">
                        {v.partyName || "—"}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate">
                        {v.reference || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {statusBadge(v.status)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold">
                        {formatMoney(v.baseAmount, data?.baseCurrency)}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {v.createdBy || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground opacity-50 mb-2" />
              <h3 className="text-lg font-semibold">No transactions found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Try adjusting your type, status, or date range filters.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
