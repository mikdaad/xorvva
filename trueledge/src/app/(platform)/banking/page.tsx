import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function BankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's entity access
  const { data: entityAccess } = await supabase
    .from("entity_users")
    .select("entity_id")
    .eq("user_id", user?.id ?? "");

  const entityIds = entityAccess?.map((ea) => ea.entity_id) ?? [];

  // Fetch bank accounts
  const { data: bankAccounts } = entityIds.length > 0
    ? await supabase
        .from("bank_accounts")
        .select("id, entity_id, bank_name, account_number, iban, currency_code, current_balance, is_active")
        .in("entity_id", entityIds)
        .eq("is_active", true)
        .order("bank_name")
    : { data: [] as { id: string; entity_id: string; bank_name: string; account_number: string; iban: string | null; currency_code: string; current_balance: number; is_active: boolean }[] };

  const accounts = bankAccounts ?? [];
  const totalBalance = accounts.reduce((sum, a) => sum + a.current_balance, 0);

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: "AED",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bank Accounts
            </CardTitle>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active accounts linked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Balance
            </CardTitle>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all bank accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unmatched Lines
            </CardTitle>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-1">Import a statement to start</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked Bank Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-t border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Bank</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Account No.</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">IBAN</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Currency</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{acc.bank_name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{acc.account_number}</td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground truncate max-w-40">{acc.iban ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">{acc.currency_code}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium">{formatCurrency(acc.current_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-muted-foreground">
                  <line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">No bank accounts linked</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Link a bank account from your Chart of Accounts to start importing statements.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
