"use server";

import { createClient } from "@/lib/supabase/server";
import type { ImportStatus, MatchStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportStatementInput {
  entity_id: string;
  bank_account_id: string;
  file_name: string;
  csv_content: string;
}

export interface BankingActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Import a bank statement from parsed CSV data.
 */
export async function importBankStatement(
  input: ImportStatementInput & {
    lines: Array<{
      line_date: string;
      value_date: string | null;
      description: string;
      reference: string | null;
      cheque_number: string | null;
      debit: number;
      credit: number;
      balance: number | null;
      raw_data: Record<string, string>;
    }>;
    bank_format: string;
    period_from: string;
    period_to: string;
    total_debits: number;
    total_credits: number;
  }
): Promise<BankingActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // 1. Create statement header
    const { data: statement, error: stErr } = await supabase
      .from("bank_statements")
      .insert({
        entity_id: input.entity_id,
        bank_account_id: input.bank_account_id,
        period_from: input.period_from,
        period_to: input.period_to,
        total_debits: input.total_debits,
        total_credits: input.total_credits,
        line_count: input.lines.length,
        source_file: input.file_name,
        source_format: input.bank_format,
        import_status: "completed" as ImportStatus,
        imported_by: user.id,
      })
      .select("id")
      .single();

    if (stErr) return { success: false, error: stErr.message };

    // 2. Insert bank lines
    const lineInserts = input.lines.map((line, idx) => ({
      statement_id: statement.id,
      entity_id: input.entity_id,
      bank_account_id: input.bank_account_id,
      line_date: line.line_date,
      value_date: line.value_date,
      description: line.description,
      reference: line.reference,
      cheque_number: line.cheque_number,
      debit: line.debit,
      credit: line.credit,
      balance: line.balance,
      raw_data: line.raw_data,
      line_number: idx + 1,
      match_status: "unmatched" as MatchStatus,
    }));

    const { error: lErr } = await supabase
      .from("bank_lines")
      .insert(lineInserts);

    if (lErr) return { success: false, error: lErr.message };

    return {
      success: true,
      data: {
        statement_id: statement.id,
        lines_imported: input.lines.length,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Fetch bank accounts for an entity.
 */
export async function getBankAccounts(entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .order("bank_name");

  return { data, error: error?.message };
}

/**
 * Fetch bank statements for a bank account.
 */
export async function getBankStatements(bankAccountId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_statements")
    .select("*")
    .eq("bank_account_id", bankAccountId)
    .order("period_to", { ascending: false });

  return { data, error: error?.message };
}

/**
 * Fetch bank lines for a statement.
 */
export async function getBankLines(statementId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_lines")
    .select("*")
    .eq("statement_id", statementId)
    .order("line_date")
    .order("line_number");

  return { data, error: error?.message };
}
