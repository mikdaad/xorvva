"use client";

import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import type { ExportFormat, ReportFilters, ReportType } from "@/lib/reports/types";

interface ExportMenuProps {
  reportType: ReportType;
  filters: ReportFilters;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ExportMenu({
  reportType,
  filters,
  className,
  variant = "outline",
  size = "sm",
}: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    try {
      setIsExporting(true);
      setActiveFormat(format);

      const response = await fetch("/api/reports/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType,
          format,
          filters,
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Export failed with status ${response.status}`);
      }

      // Get filename from Content-Disposition header if available
      const disposition = response.headers.get("Content-Disposition");
      let filename = `Report_${new Date().toISOString().split("T")[0]}.${format}`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("Failed to download export:", err);
      alert(`Export error: ${err.message || "Failed to download file."}`);
    } finally {
      setIsExporting(false);
      setActiveFormat(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isExporting}
        className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground px-3 py-1.5 text-sm ${className || ""}`}
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
            <span>Exporting {activeFormat?.toUpperCase()}...</span>
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            <span>Export</span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleExport("pdf")}
          disabled={isExporting}
          className="cursor-pointer"
        >
          <FileText className="mr-2 h-4 w-4 text-red-500" />
          <span>Download as PDF</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("xlsx")}
          disabled={isExporting}
          className="cursor-pointer"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
          <span>Download as Excel</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
