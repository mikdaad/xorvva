import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TrueLedge — Intelligent Accounting for the UAE",
    template: "%s | TrueLedge",
  },
  description:
    "Multi-tenant SaaS platform for accounting, bookkeeping, and audit. FTA VAT, Corporate Tax, and e-Invoicing compliant.",
  keywords: [
    "UAE accounting",
    "VAT compliance",
    "FTA e-invoicing",
    "corporate tax UAE",
    "bookkeeping SaaS",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
