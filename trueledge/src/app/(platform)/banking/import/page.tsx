"use client";

import { useState, useCallback } from "react";
import { parseBankStatementCSV, type ParseResult } from "@/lib/banking/csv-parser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportStep = "upload" | "preview" | "confirm";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BankImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // File processing
  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseBankStatementCSV(content);
      setParseResult(result);
      setStep(result.success ? "preview" : "upload");

      if (!result.success && result.errors.length > 0) {
        setImportError(result.errors.join(". "));
      }
    };
    reader.readAsText(file);
  }, []);

  // Drag & drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      processFile(file);
    } else {
      setImportError("Please upload a CSV file.");
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // Import confirmation
  const handleImport = async () => {
    if (!parseResult) return;
    setImporting(true);
    setImportError(null);

    // TODO: Call importBankStatement server action with entity context
    // For now, show success state
    setTimeout(() => {
      setImporting(false);
      setStep("confirm");
    }, 1000);
  };

  function formatAmount(n: number) {
    return n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const bankLabel = (format: string | null) => {
    const labels: Record<string, string> = {
      enbd: "Emirates NBD",
      adcb: "Abu Dhabi Commercial Bank",
      fab: "First Abu Dhabi Bank",
      mashreq: "Mashreq Bank",
      rak: "RAK Bank",
      dib: "Dubai Islamic Bank",
      unknown: "Unknown Format",
    };
    return labels[format ?? "unknown"] ?? "Unknown";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {importError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {importError}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-4">
        {(["upload", "preview", "confirm"] as ImportStep[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                step === s
                  ? "bg-sky-600 text-white"
                  : idx < ["upload", "preview", "confirm"].indexOf(step)
                  ? "bg-emerald-600 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {idx < ["upload", "preview", "confirm"].indexOf(step) ? "✓" : idx + 1}
            </div>
            <span className={`text-sm ${step === s ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {s === "upload" ? "Upload" : s === "preview" ? "Preview" : "Complete"}
            </span>
            {idx < 2 && (
              <div className="w-12 h-px bg-border mx-2" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Bank Statement</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
                dragActive
                  ? "border-sky-500 bg-sky-500/5"
                  : "border-border hover:border-sky-500/50 hover:bg-muted/20"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-muted-foreground/50 mb-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <p className="text-lg font-medium mb-1">
                Drop your bank statement CSV here
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports ENBD, ADCB, FAB, Mashreq, RAK Bank, and DIB formats
              </p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 transition-colors">
                  Browse Files
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && parseResult && (
        <>
          {/* Parsing summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Import Preview</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-sky-400 border-sky-500/30">
                    {bankLabel(parseResult.bank_format)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {parseResult.lines.length} transactions
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">File</span>
                  <p className="font-mono text-xs mt-1 truncate">{fileName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p className="mt-1 font-medium">
                    {parseResult.period_from && parseResult.period_to
                      ? `${parseResult.period_from} → ${parseResult.period_to}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Debits</span>
                  <p className="mt-1 font-mono font-medium text-red-400">
                    {formatAmount(parseResult.total_debits)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Credits</span>
                  <p className="mt-1 font-mono font-medium text-emerald-400">
                    {formatAmount(parseResult.total_credits)}
                  </p>
                </div>
              </div>

              {parseResult.skipped_rows > 0 && (
                <p className="text-xs text-amber-400">
                  ⚠ {parseResult.skipped_rows} rows skipped (headers, footers, or invalid data)
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transaction preview table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="sticky top-0">
                    <tr className="border-t border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-8">#</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-28">Date</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 min-w-56">Description</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-28">Reference</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-28">Debit</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-28">Credit</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-32">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.lines.slice(0, 50).map((line, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2 text-sm">{line.line_date}</td>
                        <td className="px-4 py-2 text-sm truncate max-w-72">{line.description}</td>
                        <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{line.reference ?? "—"}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono">
                          {line.debit > 0 ? (
                            <span className="text-red-400">{formatAmount(line.debit)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono">
                          {line.credit > 0 ? (
                            <span className="text-emerald-400">{formatAmount(line.credit)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono">
                          {line.balance !== null ? formatAmount(line.balance) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseResult.lines.length > 50 && (
                <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
                  Showing 50 of {parseResult.lines.length} transactions
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setStep("upload"); setParseResult(null); }} className="cursor-pointer">
              ← Back
            </Button>
            <div className="flex gap-2">
              <Button
                className="bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? "Importing..." : `Import ${parseResult.lines.length} Transactions`}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Step 3: Complete */}
      {step === "confirm" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-emerald-400">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {parseResult?.lines.length ?? 0} transactions imported from {fileName}.
              Head to reconciliation to match these with your vouchers.
            </p>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => { setStep("upload"); setParseResult(null); setFileName(""); }} className="cursor-pointer">
                Import Another
              </Button>
              <Button className="bg-sky-600 hover:bg-sky-700 text-white cursor-pointer">
                Go to Reconciliation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
