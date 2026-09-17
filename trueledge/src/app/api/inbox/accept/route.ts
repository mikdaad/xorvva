import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVoucher } from "@/lib/actions/voucher";
import type { VoucherType } from "@/types/database.types";
import type { ExtractedInvoice } from "@/lib/ai/gemini";

export async function POST(req: NextRequest) {
  try {
    const { documentId, extractionId, overrides } = await req.json();

    if (!documentId || !extractionId) {
      return NextResponse.json({ error: "documentId and extractionId are required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // 1. Fetch extraction data
    const { data: extraction, error: getExtErr } = await supabase
      .from("extractions")
      .select("entity_id, extracted_data")
      .eq("id", extractionId)
      .single();

    if (getExtErr || !extraction) {
      return NextResponse.json({ error: "Extraction not found" }, { status: 404 });
    }

    const extractedData = extraction.extracted_data as unknown as ExtractedInvoice;
    const entityId = extraction.entity_id;

    // 2. Determine placeholder account
    const { data: placeholderAccount } = await supabase
      .from("accounts")
      .select("id")
      .eq("entity_id", entityId)
      .eq("is_group", false)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!placeholderAccount) {
      return NextResponse.json({ error: "No postable accounts found in this entity" }, { status: 400 });
    }

    // 3. Prepare voucher data
    // Assume purchase_bill by default for Inbox
    const voucherType: VoucherType = "purchase_bill";
    
    // Use overrides or fallback to extracted data
    const invoiceDate = overrides?.invoiceDate || extractedData.invoice_date || new Date().toISOString().split("T")[0];
    const dueDate = overrides?.dueDate || extractedData.due_date;
    const invoiceNumber = overrides?.invoiceNumber || extractedData.invoice_number;
    const supplierTrn = overrides?.supplierTrn || extractedData.supplier_trn;
    const buyerTrn = overrides?.buyerTrn || extractedData.buyer_trn;

    // 4. Auto-match Party
    let partyId: string | null = extractedData.matched_party_id || null;
    
    // Fallback to string matching if AI didn't match
    if (!partyId && (supplierTrn || extractedData.supplier_name)) {
      if (supplierTrn) {
        const { data: trnMatch } = await supabase
          .from("parties")
          .select("id")
          .eq("entity_id", entityId)
          .eq("is_active", true)
          .eq("trn", supplierTrn)
          .limit(1)
          .maybeSingle();
        if (trnMatch) partyId = trnMatch.id;
      }
      
      if (!partyId && extractedData.supplier_name) {
        const { data: nameMatch } = await supabase
          .from("parties")
          .select("id")
          .eq("entity_id", entityId)
          .eq("is_active", true)
          .ilike("name", `%${extractedData.supplier_name}%`)
          .limit(1)
          .maybeSingle();
        if (nameMatch) partyId = nameMatch.id;
      }
    }

    // 5. Auto-match Items
    const { data: activeItems } = await supabase
      .from("items")
      .select("id, name, purchase_account_id, tax_code_id")
      .eq("entity_id", entityId)
      .eq("is_active", true);
      
    const itemsList = activeItems || [];

    // Build lines
    const lines = (extractedData.line_items || []).map((item) => {
      let matchedItem = null;
      
      // Use AI matched ID if present
      if (item.matched_item_id) {
        matchedItem = itemsList.find(i => i.id === item.matched_item_id);
      } 
      // Fallback to fuzzy string matching
      else if (item.description) {
        const descLower = item.description.toLowerCase();
        matchedItem = itemsList.find(i => 
          descLower.includes(i.name.toLowerCase()) || 
          i.name.toLowerCase().includes(descLower)
        );
      }

      const accountId = item.matched_account_id 
        || matchedItem?.purchase_account_id 
        || placeholderAccount.id;

      return {
        item_id: matchedItem?.id || null,
        account_id: accountId,
        description: item.description,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        tax_code_id: matchedItem?.tax_code_id || null,
        tax_rate: item.tax_rate || 0,
      };
    });

    // If no lines were extracted, provide one empty line to satisfy UI
    if (lines.length === 0) {
      lines.push({
        item_id: null,
        account_id: placeholderAccount.id,
        description: "Extracted item",
        quantity: 1,
        unit_price: extractedData.subtotal || 0,
        tax_code_id: null,
        tax_rate: 0,
      });
    }

    // 6. Create Draft Voucher
    const createRes = await createVoucher({
      entity_id: entityId,
      voucher_type: voucherType,
      party_id: partyId,
      voucher_date: invoiceDate,
      due_date: dueDate,
      reference: invoiceNumber,
      currency_code: extractedData.currency || "AED",
      seller_trn: supplierTrn,
      buyer_trn: buyerTrn,
      lines: lines,
    });

    if (!createRes.success || !createRes.data?.id) {
      return NextResponse.json({ error: createRes.error || "Failed to create voucher" }, { status: 500 });
    }

    const createdVoucherId = createRes.data.id as string;

    // 7. Mark extraction as accepted and link voucher
    const { error: extErr } = await supabase
      .from("extractions")
      .update({
        is_accepted: true,
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
        created_voucher_id: createdVoucherId,
      })
      .eq("id", extractionId);

    if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 });

    // 8. Mark document as accepted and link voucher
    const { error: docErr } = await supabase
      .from("documents")
      .update({ 
        status: "accepted",
        created_voucher_id: createdVoucherId
      })
      .eq("id", documentId);

    if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

    return NextResponse.json({ success: true, voucherId: createdVoucherId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
