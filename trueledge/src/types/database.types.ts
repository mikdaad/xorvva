/**
 * TypeScript types generated from the TrueLedge Supabase database schema.
 *
 * These types should eventually be auto-generated using:
 *   npx supabase gen types typescript --project-id <your-project-id> > src/types/database.types.ts
 *
 * For now, this is a manually maintained type definition that matches the
 * migrations in supabase/migrations/00001_platform_and_masters.sql
 * and supabase/migrations/00003_transactions.sql.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Enum types matching PostgreSQL enums
export type OrgStatus = "active" | "suspended" | "trial" | "cancelled";
export type EntityType = "company" | "sole_establishment" | "free_zone" | "branch" | "partnership";
export type TaxTreatment = "registered" | "unregistered" | "designated_zone" | "exempt" | "reverse_charge";
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountSubType =
  | "current_asset" | "fixed_asset"
  | "current_liability" | "long_term_liability"
  | "equity_capital" | "retained_earnings"
  | "operating_revenue" | "other_revenue"
  | "cost_of_sales" | "operating_expense" | "other_expense";
export type PartyType = "customer" | "supplier" | "both" | "employee";
export type ItemType = "inventory" | "service" | "expense" | "fixed_asset";
export type PeriodStatus = "open" | "soft_closed" | "hard_closed";
export type DimensionType = "project" | "department" | "location" | "activity" | "segment" | "custom";
export type TaxScope = "vat" | "corporate_tax" | "excise" | "withholding";

/**
 * Debit/Credit indicator, stored as CHAR(2) to match Tally's own Dr/Cr
 * notation. Null where no opening balance has been set.
 */
export type DrCr = "Dr" | "Cr" | null;

// Transaction engine enums (migration 00003)
export type VoucherType =
  | "sales_invoice" | "purchase_bill" | "credit_note" | "debit_note"
  | "receipt_voucher" | "payment_voucher" | "journal_voucher"
  | "contra" | "opening_balance";
export type VoucherStatus = "draft" | "submitted" | "posted" | "reversed" | "cancelled";
export type JournalSource = "voucher" | "reversal" | "opening" | "closing" | "adjustment" | "system";

// Banking enums (migration 00004)
export type ImportStatus = "pending" | "parsing" | "previewing" | "importing" | "completed" | "failed";
export type MatchStatus = "unmatched" | "suggested" | "matched" | "excluded";

// AI document enums (migration 00005)
export type DocumentStatus = "pending" | "uploading" | "processing" | "extracted" | "accepted" | "rejected" | "failed";

export interface Database {
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: OrgStatus;
          mfa_required: boolean;
          subscription_tier: string;
          logo_url: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: OrgStatus;
          mfa_required?: boolean;
          subscription_tier?: string;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          status?: OrgStatus;
          mfa_required?: boolean;
          subscription_tier?: string;
          logo_url?: string | null;
          settings?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          full_name: string | null;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          full_name?: string | null;
          email?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          last_login_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: string;
          role_id: string;
          resource: string;
          action: string;
        };
        Insert: {
          id?: string;
          role_id: string;
          resource: string;
          action: string;
        };
        Update: {
          resource?: string;
          action?: string;
        };
        Relationships: [];
      };
      organisation_users: {
        Row: {
          id: string;
          organisation_id: string;
          user_id: string;
          role_id: string | null;
          is_owner: boolean;
          is_active: boolean;
          joined_at: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          user_id: string;
          role_id?: string | null;
          is_owner?: boolean;
          is_active?: boolean;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          role_id?: string | null;
          is_owner?: boolean;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      entities: {
        Row: {
          id: string;
          organisation_id: string;
          trade_name: string;
          legal_name: string | null;
          trn: string | null;
          entity_type: EntityType;
          tax_treatment: TaxTreatment;
          base_currency: string;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          emirate: string | null;
          country: string;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          is_active: boolean;
          settings: Json;
          mailing_name: string | null;
          corporate_tax_trn: string | null;
          is_free_zone: boolean;
          free_zone_name: string | null;
          fiscal_year_start: string | null;
          books_begin_date: string | null;
          decimal_places: number;
          coa_template: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          trade_name: string;
          legal_name?: string | null;
          trn?: string | null;
          entity_type?: EntityType;
          tax_treatment?: TaxTreatment;
          base_currency?: string;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          emirate?: string | null;
          country?: string;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          settings?: Json;
          mailing_name?: string | null;
          corporate_tax_trn?: string | null;
          is_free_zone?: boolean;
          free_zone_name?: string | null;
          fiscal_year_start?: string | null;
          books_begin_date?: string | null;
          decimal_places?: number;
          coa_template?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          trade_name?: string;
          legal_name?: string | null;
          trn?: string | null;
          entity_type?: EntityType;
          tax_treatment?: TaxTreatment;
          base_currency?: string;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          emirate?: string | null;
          country?: string;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          settings?: Json;
          mailing_name?: string | null;
          corporate_tax_trn?: string | null;
          is_free_zone?: boolean;
          free_zone_name?: string | null;
          fiscal_year_start?: string | null;
          books_begin_date?: string | null;
          decimal_places?: number;
          coa_template?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      entity_users: {
        Row: {
          id: string;
          entity_id: string;
          user_id: string;
          role_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          user_id: string;
          role_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          role_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      fiscal_years: {
        Row: {
          id: string;
          entity_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_closed: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_closed?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          name?: string;
          start_date?: string;
          end_date?: string;
          is_closed?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      periods: {
        Row: {
          id: string;
          fiscal_year_id: string;
          entity_id: string;
          name: string;
          period_number: number;
          start_date: string;
          end_date: string;
          status: PeriodStatus;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          fiscal_year_id: string;
          entity_id: string;
          name: string;
          period_number: number;
          start_date: string;
          end_date: string;
          status?: PeriodStatus;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          name?: string;
          period_number?: number;
          start_date?: string;
          end_date?: string;
          status?: PeriodStatus;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      currencies: {
        Row: {
          id: string;
          code: string;
          name: string;
          symbol: string | null;
          decimal_places: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          symbol?: string | null;
          decimal_places?: number;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          name?: string;
          symbol?: string | null;
          decimal_places?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          entity_id: string;
          /** Optional in the Tally model — ledgers are identified by name. */
          code: string | null;
          name: string;
          name_ar: string | null;
          account_type: AccountType;
          account_sub_type: AccountSubType | null;
          parent_id: string | null;
          level: number;
          is_group: boolean;
          is_control: boolean;
          is_bank: boolean;
          is_system: boolean;
          currency_code: string | null;
          description: string | null;
          opening_balance: number;
          opening_balance_type: DrCr;
          party_trn: string | null;
          place_of_supply: string | null;
          default_tax_code_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          code?: string | null;
          name: string;
          name_ar?: string | null;
          account_type: AccountType;
          account_sub_type?: AccountSubType | null;
          parent_id?: string | null;
          level?: number;
          is_group?: boolean;
          is_control?: boolean;
          is_bank?: boolean;
          is_system?: boolean;
          currency_code?: string | null;
          description?: string | null;
          opening_balance?: number;
          opening_balance_type?: DrCr;
          party_trn?: string | null;
          place_of_supply?: string | null;
          default_tax_code_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          code?: string | null;
          name?: string;
          name_ar?: string | null;
          account_type?: AccountType;
          account_sub_type?: AccountSubType | null;
          parent_id?: string | null;
          level?: number;
          is_group?: boolean;
          is_control?: boolean;
          is_bank?: boolean;
          currency_code?: string | null;
          description?: string | null;
          opening_balance?: number;
          opening_balance_type?: DrCr;
          party_trn?: string | null;
          place_of_supply?: string | null;
          default_tax_code_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      tax_codes: {
        Row: {
          id: string;
          entity_id: string;
          code: string;
          name: string;
          rate: number;
          tax_scope: TaxScope;
          fta_code: string | null;
          account_id: string | null;
          output_account_id: string | null;
          input_account_id: string | null;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          code: string;
          name: string;
          rate?: number;
          tax_scope?: TaxScope;
          fta_code?: string | null;
          account_id?: string | null;
          output_account_id?: string | null;
          input_account_id?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          name?: string;
          rate?: number;
          tax_scope?: TaxScope;
          fta_code?: string | null;
          account_id?: string | null;
          output_account_id?: string | null;
          input_account_id?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      account_balances: {
        Row: {
          id: string;
          entity_id: string;
          account_id: string;
          period_id: string;
          debit_total: number;
          credit_total: number;
          /** Generated column: debit_total - credit_total. */
          net_change: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entity_id: string;
          account_id: string;
          period_id: string;
          debit_total?: number;
          credit_total?: number;
          updated_at?: string;
        };
        Update: {
          debit_total?: number;
          credit_total?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      parties: {
        Row: {
          id: string;
          entity_id: string;
          party_type: PartyType;
          code: string | null;
          name: string;
          name_ar: string | null;
          trn: string | null;
          tax_treatment: TaxTreatment;
          control_account_id: string | null;
          default_tax_code_id: string | null;
          credit_limit: number | null;
          payment_terms_days: number | null;
          contact_person: string | null;
          email: string | null;
          phone: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          country: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          party_type?: PartyType;
          code?: string | null;
          name: string;
          name_ar?: string | null;
          trn?: string | null;
          tax_treatment?: TaxTreatment;
          control_account_id?: string | null;
          default_tax_code_id?: string | null;
          credit_limit?: number | null;
          payment_terms_days?: number | null;
          contact_person?: string | null;
          email?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          party_type?: PartyType;
          code?: string | null;
          name?: string;
          name_ar?: string | null;
          trn?: string | null;
          tax_treatment?: TaxTreatment;
          control_account_id?: string | null;
          default_tax_code_id?: string | null;
          credit_limit?: number | null;
          payment_terms_days?: number | null;
          contact_person?: string | null;
          email?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string | null;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          entity_id: string;
          item_type: ItemType;
          code: string;
          name: string;
          name_ar: string | null;
          description: string | null;
          unit_of_measure: string | null;
          purchase_account_id: string | null;
          sales_account_id: string | null;
          tax_code_id: string | null;
          default_price: number | null;
          hsn_code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          item_type?: ItemType;
          code: string;
          name: string;
          name_ar?: string | null;
          description?: string | null;
          unit_of_measure?: string | null;
          purchase_account_id?: string | null;
          sales_account_id?: string | null;
          tax_code_id?: string | null;
          default_price?: number | null;
          hsn_code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          item_type?: ItemType;
          code?: string;
          name?: string;
          name_ar?: string | null;
          description?: string | null;
          unit_of_measure?: string | null;
          purchase_account_id?: string | null;
          sales_account_id?: string | null;
          tax_code_id?: string | null;
          default_price?: number | null;
          hsn_code?: string | null;
          is_active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      cost_centre_dimensions: {
        Row: {
          id: string;
          entity_id: string;
          dimension_type: DimensionType;
          name: string;
          code: string;
          description: string | null;
          is_mandatory: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          dimension_type?: DimensionType;
          name: string;
          code: string;
          description?: string | null;
          is_mandatory?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          dimension_type?: DimensionType;
          name?: string;
          code?: string;
          description?: string | null;
          is_mandatory?: boolean;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      cost_centres: {
        Row: {
          id: string;
          entity_id: string;
          dimension_id: string;
          code: string;
          name: string;
          parent_id: string | null;
          level: number;
          is_group: boolean;
          is_active: boolean;
          budget: number | null;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          dimension_id: string;
          code: string;
          name: string;
          parent_id?: string | null;
          level?: number;
          is_group?: boolean;
          is_active?: boolean;
          budget?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          dimension_id?: string;
          code?: string;
          name?: string;
          parent_id?: string | null;
          level?: number;
          is_group?: boolean;
          is_active?: boolean;
          budget?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      // =====================================================================
      // Transaction Engine Tables (Migration 00003)
      // =====================================================================
      voucher_sequences: {
        Row: {
          id: string;
          entity_id: string;
          voucher_type: VoucherType;
          prefix: string;
          last_number: number;
          fiscal_year: number;
        };
        Insert: {
          id?: string;
          entity_id: string;
          voucher_type: VoucherType;
          prefix: string;
          last_number?: number;
          fiscal_year?: number;
        };
        Update: {
          prefix?: string;
          last_number?: number;
          fiscal_year?: number;
        };
        Relationships: [];
      };
      vouchers: {
        Row: {
          id: string;
          entity_id: string;
          voucher_type: VoucherType;
          voucher_number: string;
          status: VoucherStatus;
          party_id: string | null;
          voucher_date: string;
          due_date: string | null;
          supply_date: string | null;
          currency_code: string;
          exchange_rate: number;
          subtotal: number;
          discount_total: number;
          tax_total: number;
          total_amount: number;
          base_subtotal: number;
          base_discount: number;
          base_tax_total: number;
          base_total_amount: number;
          amount_paid: number;
          amount_due: number;
          reference: string | null;
          narration: string | null;
          terms_and_conditions: string | null;
          internal_notes: string | null;
          place_of_supply: string | null;
          buyer_trn: string | null;
          seller_trn: string | null;
          period_id: string | null;
          posted_at: string | null;
          posted_by: string | null;
          reversed_by_id: string | null;
          reversal_of_id: string | null;
          reversal_reason: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          voucher_type: VoucherType;
          voucher_number: string;
          status?: VoucherStatus;
          party_id?: string | null;
          voucher_date?: string;
          due_date?: string | null;
          supply_date?: string | null;
          currency_code?: string;
          exchange_rate?: number;
          subtotal?: number;
          discount_total?: number;
          tax_total?: number;
          total_amount?: number;
          base_subtotal?: number;
          base_discount?: number;
          base_tax_total?: number;
          base_total_amount?: number;
          amount_paid?: number;
          reference?: string | null;
          narration?: string | null;
          terms_and_conditions?: string | null;
          internal_notes?: string | null;
          place_of_supply?: string | null;
          buyer_trn?: string | null;
          seller_trn?: string | null;
          period_id?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          reversed_by_id?: string | null;
          reversal_of_id?: string | null;
          reversal_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          voucher_type?: VoucherType;
          voucher_number?: string;
          status?: VoucherStatus;
          party_id?: string | null;
          voucher_date?: string;
          due_date?: string | null;
          supply_date?: string | null;
          currency_code?: string;
          exchange_rate?: number;
          subtotal?: number;
          discount_total?: number;
          tax_total?: number;
          total_amount?: number;
          base_subtotal?: number;
          base_discount?: number;
          base_tax_total?: number;
          base_total_amount?: number;
          amount_paid?: number;
          reference?: string | null;
          narration?: string | null;
          terms_and_conditions?: string | null;
          internal_notes?: string | null;
          place_of_supply?: string | null;
          buyer_trn?: string | null;
          seller_trn?: string | null;
          period_id?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          reversed_by_id?: string | null;
          reversal_of_id?: string | null;
          reversal_reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      voucher_lines: {
        Row: {
          id: string;
          voucher_id: string;
          entity_id: string;
          line_number: number;
          item_id: string | null;
          account_id: string;
          description: string | null;
          quantity: number;
          unit_price: number;
          discount_pct: number;
          line_amount: number;
          tax_code_id: string | null;
          tax_rate: number;
          tax_amount: number;
          line_total: number;
          base_line_amount: number;
          base_tax_amount: number;
          base_line_total: number;
          cost_centre_id: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          voucher_id: string;
          entity_id: string;
          line_number: number;
          item_id?: string | null;
          account_id: string;
          description?: string | null;
          quantity?: number;
          unit_price?: number;
          discount_pct?: number;
          line_amount?: number;
          tax_code_id?: string | null;
          tax_rate?: number;
          tax_amount?: number;
          line_total?: number;
          base_line_amount?: number;
          base_tax_amount?: number;
          base_line_total?: number;
          cost_centre_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          line_number?: number;
          item_id?: string | null;
          account_id?: string;
          description?: string | null;
          quantity?: number;
          unit_price?: number;
          discount_pct?: number;
          line_amount?: number;
          tax_code_id?: string | null;
          tax_rate?: number;
          tax_amount?: number;
          line_total?: number;
          base_line_amount?: number;
          base_tax_amount?: number;
          base_line_total?: number;
          cost_centre_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          entity_id: string;
          voucher_id: string | null;
          entry_number: string;
          entry_date: string;
          period_id: string;
          source: JournalSource;
          narration: string | null;
          currency_code: string;
          exchange_rate: number;
          status: VoucherStatus;
          posted_at: string | null;
          posted_by: string | null;
          reversal_of_id: string | null;
          reversed_by_id: string | null;
          reversal_reason: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          voucher_id?: string | null;
          entry_number: string;
          entry_date?: string;
          period_id: string;
          source?: JournalSource;
          narration?: string | null;
          currency_code?: string;
          exchange_rate?: number;
          status?: VoucherStatus;
          posted_at?: string | null;
          posted_by?: string | null;
          reversal_of_id?: string | null;
          reversed_by_id?: string | null;
          reversal_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          entry_number?: string;
          entry_date?: string;
          period_id?: string;
          source?: JournalSource;
          narration?: string | null;
          currency_code?: string;
          exchange_rate?: number;
          status?: VoucherStatus;
          posted_at?: string | null;
          posted_by?: string | null;
          reversal_of_id?: string | null;
          reversed_by_id?: string | null;
          reversal_reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      journal_lines: {
        Row: {
          id: string;
          journal_entry_id: string;
          entity_id: string;
          line_number: number;
          account_id: string;
          party_id: string | null;
          description: string | null;
          debit_amount: number;
          credit_amount: number;
          base_debit: number;
          base_credit: number;
          cost_centre_id: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          journal_entry_id: string;
          entity_id: string;
          line_number: number;
          account_id: string;
          party_id?: string | null;
          description?: string | null;
          debit_amount?: number;
          credit_amount?: number;
          base_debit?: number;
          base_credit?: number;
          cost_centre_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          line_number?: number;
          account_id?: string;
          party_id?: string | null;
          description?: string | null;
          debit_amount?: number;
          credit_amount?: number;
          base_debit?: number;
          base_credit?: number;
          cost_centre_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      allocations: {
        Row: {
          id: string;
          entity_id: string;
          payment_voucher_id: string;
          invoice_voucher_id: string;
          allocated_amount: number;
          base_allocated_amount: number;
          allocated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          payment_voucher_id: string;
          invoice_voucher_id: string;
          allocated_amount: number;
          base_allocated_amount: number;
          allocated_at?: string;
          created_by?: string | null;
        };
        Update: {
          allocated_amount?: number;
          base_allocated_amount?: number;
        };
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          entity_id: string;
          voucher_id: string;
          file_name: string;
          file_url: string;
          file_size: number | null;
          mime_type: string | null;
          description: string | null;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          voucher_id: string;
          file_name: string;
          file_url: string;
          file_size?: number | null;
          mime_type?: string | null;
          description?: string | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          file_name?: string;
          file_url?: string;
          file_size?: number | null;
          mime_type?: string | null;
          description?: string | null;
        };
        Relationships: [];
      };

      // ====================================================================
      // Banking tables (migration 00004)
      // ====================================================================

      bank_accounts: {
        Row: {
          id: string;
          entity_id: string;
          account_id: string;
          bank_name: string;
          account_number: string;
          iban: string | null;
          swift_code: string | null;
          branch: string | null;
          currency_code: string;
          opening_balance: number;
          current_balance: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          account_id: string;
          bank_name: string;
          account_number: string;
          iban?: string | null;
          swift_code?: string | null;
          branch?: string | null;
          currency_code?: string;
          opening_balance?: number;
          current_balance?: number;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          bank_name?: string;
          account_number?: string;
          iban?: string | null;
          swift_code?: string | null;
          branch?: string | null;
          currency_code?: string;
          current_balance?: number;
          is_active?: boolean;
          updated_by?: string | null;
        };
        Relationships: [
          { foreignKeyName: "bank_accounts_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "bank_accounts_account_id_fkey"; columns: ["account_id"]; referencedRelation: "accounts"; referencedColumns: ["id"] },
        ];
      };

      bank_statements: {
        Row: {
          id: string;
          entity_id: string;
          bank_account_id: string;
          statement_date: string | null;
          period_from: string;
          period_to: string;
          opening_balance: number | null;
          closing_balance: number | null;
          total_debits: number;
          total_credits: number;
          line_count: number;
          source_file: string | null;
          source_format: string | null;
          import_status: ImportStatus;
          import_errors: Record<string, unknown> | null;
          imported_at: string;
          imported_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          bank_account_id: string;
          statement_date?: string | null;
          period_from: string;
          period_to: string;
          opening_balance?: number | null;
          closing_balance?: number | null;
          total_debits?: number;
          total_credits?: number;
          line_count?: number;
          source_file?: string | null;
          source_format?: string | null;
          import_status?: ImportStatus;
          import_errors?: Record<string, unknown> | null;
          imported_by?: string | null;
        };
        Update: {
          import_status?: ImportStatus;
          import_errors?: Record<string, unknown> | null;
          closing_balance?: number | null;
          line_count?: number;
        };
        Relationships: [
          { foreignKeyName: "bank_statements_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "bank_statements_bank_account_id_fkey"; columns: ["bank_account_id"]; referencedRelation: "bank_accounts"; referencedColumns: ["id"] },
        ];
      };

      bank_lines: {
        Row: {
          id: string;
          statement_id: string;
          entity_id: string;
          bank_account_id: string;
          line_date: string;
          value_date: string | null;
          description: string;
          reference: string | null;
          cheque_number: string | null;
          debit: number;
          credit: number;
          balance: number | null;
          raw_data: Record<string, unknown> | null;
          line_number: number;
          match_status: MatchStatus;
          matched_voucher_id: string | null;
          matched_at: string | null;
          matched_by: string | null;
          match_rule_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_id: string;
          entity_id: string;
          bank_account_id: string;
          line_date: string;
          value_date?: string | null;
          description: string;
          reference?: string | null;
          cheque_number?: string | null;
          debit?: number;
          credit?: number;
          balance?: number | null;
          raw_data?: Record<string, unknown> | null;
          line_number?: number;
          match_status?: MatchStatus;
          matched_voucher_id?: string | null;
          matched_at?: string | null;
          matched_by?: string | null;
          match_rule_id?: string | null;
        };
        Update: {
          match_status?: MatchStatus;
          matched_voucher_id?: string | null;
          matched_at?: string | null;
          matched_by?: string | null;
          match_rule_id?: string | null;
        };
        Relationships: [
          { foreignKeyName: "bank_lines_statement_id_fkey"; columns: ["statement_id"]; referencedRelation: "bank_statements"; referencedColumns: ["id"] },
          { foreignKeyName: "bank_lines_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "bank_lines_matched_voucher_id_fkey"; columns: ["matched_voucher_id"]; referencedRelation: "vouchers"; referencedColumns: ["id"] },
        ];
      };

      match_rules: {
        Row: {
          id: string;
          entity_id: string;
          rule_name: string;
          description: string | null;
          pattern: string;
          pattern_field: string;
          target_account_id: string | null;
          target_party_id: string | null;
          target_voucher_type: VoucherType | null;
          priority: number;
          is_active: boolean;
          times_used: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          rule_name: string;
          description?: string | null;
          pattern: string;
          pattern_field?: string;
          target_account_id?: string | null;
          target_party_id?: string | null;
          target_voucher_type?: VoucherType | null;
          priority?: number;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          rule_name?: string;
          description?: string | null;
          pattern?: string;
          pattern_field?: string;
          target_account_id?: string | null;
          target_party_id?: string | null;
          target_voucher_type?: VoucherType | null;
          priority?: number;
          is_active?: boolean;
          times_used?: number;
          last_used_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          { foreignKeyName: "match_rules_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "match_rules_target_account_id_fkey"; columns: ["target_account_id"]; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "match_rules_target_party_id_fkey"; columns: ["target_party_id"]; referencedRelation: "parties"; referencedColumns: ["id"] },
        ];
      };

      // ====================================================================
      // AI Document tables (migration 00005)
      // ====================================================================

      documents: {
        Row: {
          id: string;
          entity_id: string;
          file_name: string;
          file_url: string;
          file_size: number | null;
          mime_type: string;
          status: DocumentStatus;
          status_message: string | null;
          created_voucher_id: string | null;
          uploaded_at: string;
          uploaded_by: string;
          processed_at: string | null;
          page_count: number | null;
          tags: string[] | null;
        };
        Insert: {
          id?: string;
          entity_id: string;
          file_name: string;
          file_url: string;
          file_size?: number | null;
          mime_type: string;
          status?: DocumentStatus;
          status_message?: string | null;
          created_voucher_id?: string | null;
          uploaded_by: string;
          page_count?: number | null;
          tags?: string[] | null;
        };
        Update: {
          status?: DocumentStatus;
          status_message?: string | null;
          created_voucher_id?: string | null;
          processed_at?: string | null;
          page_count?: number | null;
          tags?: string[] | null;
        };
        Relationships: [
          { foreignKeyName: "documents_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "documents_created_voucher_id_fkey"; columns: ["created_voucher_id"]; referencedRelation: "vouchers"; referencedColumns: ["id"] },
        ];
      };

      extractions: {
        Row: {
          id: string;
          document_id: string;
          entity_id: string;
          model_used: string;
          model_version: string | null;
          processing_time_ms: number | null;
          raw_response: Record<string, unknown> | null;
          extracted_data: Record<string, unknown>;
          confidence_score: number;
          created_voucher_id: string | null;
          is_accepted: boolean;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          document_id: string;
          entity_id: string;
          model_used?: string;
          model_version?: string | null;
          processing_time_ms?: number | null;
          raw_response?: Record<string, unknown> | null;
          extracted_data: Record<string, unknown>;
          confidence_score?: number;
          created_voucher_id?: string | null;
          is_accepted?: boolean;
          created_by?: string | null;
        };
        Update: {
          is_accepted?: boolean;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_voucher_id?: string | null;
        };
        Relationships: [
          { foreignKeyName: "extractions_document_id_fkey"; columns: ["document_id"]; referencedRelation: "documents"; referencedColumns: ["id"] },
          { foreignKeyName: "extractions_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
          { foreignKeyName: "extractions_created_voucher_id_fkey"; columns: ["created_voucher_id"]; referencedRelation: "vouchers"; referencedColumns: ["id"] },
        ];
      };

      ai_suggestions: {
        Row: {
          id: string;
          extraction_id: string;
          entity_id: string;
          field_name: string;
          field_group: string | null;
          extracted_value: string | null;
          confidence: number;
          user_override: string | null;
          final_value: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          extraction_id: string;
          entity_id: string;
          field_name: string;
          field_group?: string | null;
          extracted_value?: string | null;
          confidence?: number;
          user_override?: string | null;
          final_value?: string | null;
        };
        Update: {
          user_override?: string | null;
          final_value?: string | null;
        };
        Relationships: [
          { foreignKeyName: "ai_suggestions_extraction_id_fkey"; columns: ["extraction_id"]; referencedRelation: "extractions"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_suggestions_entity_id_fkey"; columns: ["entity_id"]; referencedRelation: "entities"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_current_org_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      has_entity_access: {
        Args: { p_entity_id: string };
        Returns: boolean;
      };
      is_org_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      is_entity_member: {
        Args: { p_entity_id: string };
        Returns: boolean;
      };
      /**
       * Creates an entity, its fiscal year + 12 periods, the entity_users
       * owner row, and the full Tally-style chart of accounts in one
       * transaction. Returns the new entity id.
       */
      create_entity_with_defaults: {
        Args: {
          p_organisation_id: string;
          p_trade_name: string;
          p_legal_name?: string | null;
          p_mailing_name?: string | null;
          p_trn?: string | null;
          p_corporate_tax_trn?: string | null;
          p_entity_type?: EntityType;
          p_tax_treatment?: TaxTreatment;
          p_base_currency?: string;
          p_decimal_places?: number;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_emirate?: string | null;
          p_country?: string;
          p_is_free_zone?: boolean;
          p_free_zone_name?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
          p_fiscal_year_start?: string | null;
          p_books_begin_date?: string | null;
          p_coa_template?: string | null;
          p_extra_ledgers?: Json;
          p_role_id?: string | null;
        };
        Returns: string;
      };
      generate_voucher_number: {
        Args: {
          p_entity_id: string;
          p_voucher_type: VoucherType;
          p_fiscal_year?: number;
        };
        Returns: string;
      };
      /**
       * Posts a draft voucher: resolves the period from the voucher date,
       * writes the journal entry and its lines, refreshes account balances and
       * flips the voucher to `posted` — all in one transaction.
       * Returns the new journal entry id.
       */
      post_voucher_atomic: {
        Args: {
          p_voucher_id: string;
          p_lines: Array<{
            account_id: string;
            party_id: string | null;
            description: string | null;
            debit: number;
            credit: number;
            base_debit: number;
            base_credit: number;
            cost_centre_id: string | null;
          }>;
        };
        Returns: string;
      };
    };
    Enums: {
      org_status: OrgStatus;
      entity_type: EntityType;
      tax_treatment: TaxTreatment;
      account_type: AccountType;
      account_sub_type: AccountSubType;
      party_type: PartyType;
      item_type: ItemType;
      period_status: PeriodStatus;
      dimension_type: DimensionType;
      tax_scope: TaxScope;
      voucher_type: VoucherType;
      voucher_status: VoucherStatus;
      journal_source: JournalSource;
      import_status: ImportStatus;
      match_status: MatchStatus;
      document_status: DocumentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
