-- ============================================================================
-- RPC FUNCTION: get_balance_sheet
-- Calculates the balance sheet for an entity as of a specific date.
-- Includes only POSTED journal entries up to p_as_of.
-- Dynamically calculates Retained Earnings as Net Revenue minus Net Expense.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_entity_id UUID,
  p_as_of DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_name TEXT;
  v_base_currency TEXT;
  
  v_retained_earnings NUMERIC := 0;
  v_total_assets NUMERIC := 0;
  v_total_liabilities NUMERIC := 0;
  v_total_equity NUMERIC := 0;
  
  v_assets_json JSONB;
  v_liabilities_json JSONB;
  v_equity_json JSONB;
  v_result JSONB;
BEGIN
  -- Get entity details
  SELECT legal_name, base_currency 
  INTO v_entity_name, v_base_currency
  FROM public.entities
  WHERE id = p_entity_id;

  IF v_entity_name IS NULL THEN
    v_entity_name := 'Unknown Entity';
    v_base_currency := 'AED';
  END IF;

  -- Create temporary table for account balances
  CREATE TEMP TABLE temp_acc_balances ON COMMIT DROP AS
  WITH posted_totals AS (
    SELECT 
      jl.account_id,
      COALESCE(SUM(jl.base_debit), 0) AS posted_debit,
      COALESCE(SUM(jl.base_credit), 0) AS posted_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.entity_id = p_entity_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of
    GROUP BY jl.account_id
  )
  SELECT 
    a.id,
    a.name,
    a.code,
    a.parent_id,
    a.is_group,
    a.account_type,
    a.account_sub_type,
    a.opening_balance,
    a.opening_balance_type,
    COALESCE(pt.posted_debit, 0) AS posted_debit,
    COALESCE(pt.posted_credit, 0) AS posted_credit,
    CASE 
      WHEN a.opening_balance_type = 'Dr' THEN COALESCE(a.opening_balance, 0)
      ELSE 0
    END AS op_debit,
    CASE 
      WHEN a.opening_balance_type = 'Cr' THEN COALESCE(a.opening_balance, 0)
      ELSE 0
    END AS op_credit
  FROM public.accounts a
  LEFT JOIN posted_totals pt ON pt.account_id = a.id
  WHERE a.entity_id = p_entity_id
    AND a.is_active = true;

  -- Calculate Retained Earnings (Net Revenue - Net Expense)
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN account_type = 'revenue' THEN (op_credit + posted_credit) - (op_debit + posted_debit)
        WHEN account_type = 'expense' THEN -((op_debit + posted_debit) - (op_credit + posted_credit))
        ELSE 0
      END
    ), 0)
  INTO v_retained_earnings
  FROM temp_acc_balances
  WHERE account_type IN ('revenue', 'expense');

  -- Calculate Assets Total
  SELECT COALESCE(SUM((op_debit + posted_debit) - (op_credit + posted_credit)), 0)
  INTO v_total_assets
  FROM temp_acc_balances
  WHERE account_type = 'asset' AND is_group = false;

  -- Calculate Liabilities Total
  SELECT COALESCE(SUM((op_credit + posted_credit) - (op_debit + posted_debit)), 0)
  INTO v_total_liabilities
  FROM temp_acc_balances
  WHERE account_type = 'liability' AND is_group = false;

  -- Calculate Equity Total (Direct Equity Accounts + Dynamic Retained Earnings)
  SELECT COALESCE(SUM((op_credit + posted_credit) - (op_debit + posted_debit)), 0) + v_retained_earnings
  INTO v_total_equity
  FROM temp_acc_balances
  WHERE account_type = 'equity' AND is_group = false;

  -- Build Assets Nodes JSON
  SELECT jsonb_build_object(
    'total', v_total_assets,
    'nodes', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'code', code,
        'isGroup', is_group,
        'amount', (op_debit + posted_debit) - (op_credit + posted_credit),
        'drillAccountId', CASE WHEN is_group = false THEN id ELSE NULL END,
        'children', jsonb_build_array()
      )
    ), '[]'::jsonb)
  )
  INTO v_assets_json
  FROM temp_acc_balances
  WHERE account_type = 'asset' 
    AND (is_group = true OR ((op_debit + posted_debit) - (op_credit + posted_credit)) <> 0);

  -- Build Liabilities Nodes JSON
  SELECT jsonb_build_object(
    'total', v_total_liabilities,
    'nodes', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'code', code,
        'isGroup', is_group,
        'amount', (op_credit + posted_credit) - (op_debit + posted_debit),
        'drillAccountId', CASE WHEN is_group = false THEN id ELSE NULL END,
        'children', jsonb_build_array()
      )
    ), '[]'::jsonb)
  )
  INTO v_liabilities_json
  FROM temp_acc_balances
  WHERE account_type = 'liability'
    AND (is_group = true OR ((op_credit + posted_credit) - (op_debit + posted_debit)) <> 0);

  -- Build Equity Nodes JSON
  SELECT jsonb_build_object(
    'total', v_total_equity,
    'nodes', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'code', code,
        'isGroup', is_group,
        'amount', (op_credit + posted_credit) - (op_debit + posted_debit),
        'drillAccountId', CASE WHEN is_group = false THEN id ELSE NULL END,
        'children', jsonb_build_array()
      )
    ), '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'id', 'retained-earnings-node',
        'name', 'Retained Earnings (Net Profit/Loss)',
        'code', '3999',
        'isGroup', false,
        'amount', v_retained_earnings,
        'drillAccountId', NULL,
        'children', jsonb_build_array()
      )
    )
  )
  INTO v_equity_json
  FROM temp_acc_balances
  WHERE account_type = 'equity'
    AND (is_group = true OR ((op_credit + posted_credit) - (op_debit + posted_debit)) <> 0);

  -- Assemble final JSON payload
  v_result := jsonb_build_object(
    'entityId', p_entity_id,
    'entityName', v_entity_name,
    'baseCurrency', v_base_currency,
    'asOf', p_as_of,
    'assets', v_assets_json,
    'liabilities', v_liabilities_json,
    'equity', v_equity_json,
    'retainedEarnings', v_retained_earnings,
    'totalAssets', v_total_assets,
    'totalLiabilitiesAndEquity', v_total_liabilities + v_total_equity,
    'difference', v_total_assets - (v_total_liabilities + v_total_equity)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_balance_sheet(UUID, DATE) IS
'Aggregates balance sheet as of date for posted journal entries, injecting net income as retained earnings.';
