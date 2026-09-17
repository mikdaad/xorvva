"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBalanceSheet } from "@/lib/actions/reports";
import type { BalanceSheetResult, BalanceSheetNode } from "@/lib/reports/types";
import { formatMoney } from "@/lib/reports/labels";
import { ExportMenu } from "@/components/reports/export-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  Scale,
  PieChart,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Recursive Tree Row Component
// ---------------------------------------------------------------------------

interface TreeNodeRowProps {
  node: BalanceSheetNode;
  level: number;
  currency: string;
  onDrillDown: (accountId: string) => void;
}

function TreeNodeRow({ node, level, currency, onDrillDown }: TreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isLeafLedger = !node.isGroup && node.drillAccountId !== null;

  return (
    <>
      <tr
        className={`group border-b border-border/50 transition-colors hover:bg-muted/40 ${
          node.isGroup ? "bg-muted/20 font-semibold" : ""
        }`}
      >
        {/* Name & Code with hierarchical indent */}
        <td className="py-3 px-4 text-sm">
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: `${level * 20}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}

            {node.code && (
              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {node.code}
              </span>
            )}

            <span className={node.isGroup ? "font-semibold text-foreground" : "text-foreground/90"}>
              {node.name}
            </span>

            {node.id === "retained-earnings-node" && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                Calculated P&L
              </Badge>
            )}
          </div>
        </td>

        {/* Amount */}
        <td className="py-3 px-4 text-right text-sm font-mono font-medium">
          <span className={node.amount < 0 ? "text-red-500" : ""}>
            {formatMoney(node.amount, currency)}
          </span>
        </td>

        {/* Actions / Drill down */}
        <td className="py-3 px-4 text-right w-16">
          {isLeafLedger ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drill down to Ledger Statement"
              onClick={() => onDrillDown(node.drillAccountId!)}
            >
              <ArrowUpRight className="h-4 w-4 text-primary" />
            </Button>
          ) : null}
        </td>
      </tr>

      {/* Render children recursively if expanded */}
      {hasChildren &&
        isExpanded &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            level={level + 1}
            currency={currency}
            onDrillDown={onDrillDown}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Balance Sheet Page Component
// ---------------------------------------------------------------------------

export default function BalanceSheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialAsOf = searchParams.get("asOf") || new Date().toISOString().split("T")[0];
  const [asOfDate, setAsOfDate] = useState(initialAsOf);
  const [data, setData] = useState<BalanceSheetResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async (date: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getBalanceSheet(date);
      setData(result);
    } catch (err: any) {
      console.error("Balance sheet loading error:", err);
      setError(err.message || "Failed to load Balance Sheet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(asOfDate);
  }, [asOfDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      setAsOfDate(newDate);
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("asOf", newDate);
        router.push(`/reports/balance-sheet?${params.toString()}`);
      });
    }
  };

  const handleDrillDown = (accountId: string) => {
    router.push(`/reports/ledger?accountId=${accountId}`);
  };

  return (
    <div className="space-y-6 p-1 sm:p-2">
      {/* Top Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4 border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Balance Sheet</h1>
            {data && (
              <Badge variant="outline" className="text-xs">
                {data.baseCurrency}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {data?.entityName || "Financial Statement"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* As Of Date Picker */}
          <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <label htmlFor="asOfInput" className="text-xs text-muted-foreground font-medium">
              As Of:
            </label>
            <input
              id="asOfInput"
              type="date"
              value={asOfDate}
              onChange={handleDateChange}
              className="bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(asOfDate)}
            disabled={loading || isPending}
            title="Refresh balance sheet data"
          >
            <RefreshCw className={`h-4 w-4 ${loading || isPending ? "animate-spin" : ""}`} />
          </Button>

          {/* Export Menu */}
          <ExportMenu
            reportType="balance_sheet"
            filters={{ asOf: asOfDate }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold">Error Loading Balance Sheet</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Assets
            </CardTitle>
            <Scale className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {data ? formatMoney(data.totalAssets, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current & Fixed Assets</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Liabilities
            </CardTitle>
            <Scale className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {data ? formatMoney(data.liabilities.total, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Payables & Borrowings</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Equity & Net Profit
            </CardTitle>
            <PieChart className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-400">
              {data ? formatMoney(data.equity.total, data.baseCurrency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              P&L Retained: {data ? formatMoney(data.retainedEarnings, data.baseCurrency) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Book Balance Status
            </CardTitle>
            {data && Math.abs(data.difference) < 0.01 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            {data && Math.abs(data.difference) < 0.01 ? (
              <>
                <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>Balanced</span>
                </div>
                <p className="text-xs text-emerald-500/80 mt-1">Assets = Liabilities + Equity</p>
              </>
            ) : (
              <>
                <div className="text-xl font-bold text-red-400">
                  {data ? formatMoney(data.difference, data?.baseCurrency) : "—"}
                </div>
                <p className="text-xs text-red-400/80 mt-1">Unbalanced ledger variance</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Balance Sheet Tree Grid */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Statement of Financial Position
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Click leaf ledgers to drill down into detailed transaction lines
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Aggregating real-time ledger balances...</p>
            </div>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">Account / Group</th>
                    <th className="py-3 px-4 text-right">Amount ({data.baseCurrency})</th>
                    <th className="py-3 px-4 text-right w-16">Drill</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ASSETS SECTION */}
                  <tr className="bg-emerald-950/20 border-t border-b border-emerald-500/30">
                    <td colSpan={2} className="py-2.5 px-4 font-bold text-emerald-400 text-sm">
                      ASSETS
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                      {formatMoney(data.totalAssets, data.baseCurrency)}
                    </td>
                  </tr>
                  {data.assets.nodes.length > 0 ? (
                    data.assets.nodes.map((node) => (
                      <TreeNodeRow
                        key={node.id}
                        node={node}
                        level={1}
                        currency={data.baseCurrency}
                        onDrillDown={handleDrillDown}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                        No posted asset accounts found as of this date.
                      </td>
                    </tr>
                  )}

                  {/* LIABILITIES SECTION */}
                  <tr className="bg-amber-950/20 border-t border-b border-amber-500/30">
                    <td colSpan={2} className="py-2.5 px-4 font-bold text-amber-400 text-sm">
                      LIABILITIES
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-400 text-sm">
                      {formatMoney(data.liabilities.total, data.baseCurrency)}
                    </td>
                  </tr>
                  {data.liabilities.nodes.length > 0 ? (
                    data.liabilities.nodes.map((node) => (
                      <TreeNodeRow
                        key={node.id}
                        node={node}
                        level={1}
                        currency={data.baseCurrency}
                        onDrillDown={handleDrillDown}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                        No posted liability accounts found as of this date.
                      </td>
                    </tr>
                  )}

                  {/* EQUITY SECTION */}
                  <tr className="bg-sky-950/20 border-t border-b border-sky-500/30">
                    <td colSpan={2} className="py-2.5 px-4 font-bold text-sky-400 text-sm">
                      EQUITY & CAPITAL
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-sky-400 text-sm">
                      {formatMoney(data.equity.total, data.baseCurrency)}
                    </td>
                  </tr>
                  {data.equity.nodes.length > 0 ? (
                    data.equity.nodes.map((node) => (
                      <TreeNodeRow
                        key={node.id}
                        node={node}
                        level={1}
                        currency={data.baseCurrency}
                        onDrillDown={handleDrillDown}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
                        No posted equity accounts found as of this date.
                      </td>
                    </tr>
                  )}

                  {/* GRAND TOTAL ROW */}
                  <tr className="bg-muted/60 border-t-2 border-primary/40 font-bold text-sm">
                    <td className="py-3 px-4 text-foreground">
                      TOTAL LIABILITIES & EQUITY
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-primary">
                      {formatMoney(data.totalLiabilitiesAndEquity, data.baseCurrency)}
                    </td>
                    <td />
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
