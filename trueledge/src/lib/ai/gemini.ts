/**
 * Gemini Vision API Integration for Invoice/Document Extraction
 *
 * Uses Google's Gemini 2.5 Flash with structured output to extract
 * invoice data from uploaded PDFs and images.
 *
 * SAFETY RULE: This module NEVER returns a status other than 'draft'.
 * All AI-created vouchers require explicit human review and posting.
 */

import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  confidence: number;
  matched_item_id?: string | null;
  matched_account_id?: string | null;
}

export interface ExtractedInvoice {
  // Header fields
  supplier_name: string | null;
  supplier_trn: string | null;
  buyer_name: string | null;
  buyer_trn: string | null;
  invoice_number: string | null;
  invoice_date: string | null;       // ISO date
  due_date: string | null;           // ISO date
  currency: string;
  place_of_supply: string | null;

  // Line items
  line_items: ExtractedLineItem[];

  // Totals
  subtotal: number;
  tax_total: number;
  grand_total: number;

  // Metadata
  document_type: "invoice" | "bill" | "receipt" | "credit_note" | "unknown";
  overall_confidence: number;        // 0.0 to 1.0

  // Per-field confidence
  field_confidence: Record<string, number>;

  // AI Master matching
  matched_party_id?: string | null;
}

export interface AvailableMasters {
  parties: Array<{ id: string; name: string; trn: string | null }>;
  items: Array<{ id: string; name: string; purchase_account_id: string | null; tax_code_id: string | null }>;
  accounts: Array<{ id: string; name: string }>;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedInvoice | null;
  raw_response: unknown;
  model_used: string;
  processing_time_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Confidence Thresholds
// ---------------------------------------------------------------------------

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.60,
  LOW: 0,
} as const;

export function getConfidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return "medium";
  return "low";
}

export function getConfidenceBadge(score: number) {
  const level = getConfidenceLevel(score);
  const badges = {
    high: { label: "High Confidence", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    medium: { label: "Review Recommended", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    low: { label: "Manual Entry Required", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  return { ...badges[level], score, level };
}

// ---------------------------------------------------------------------------
// Gemini Schema (Structured Output)
// ---------------------------------------------------------------------------

const INVOICE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    supplier_name: { type: SchemaType.STRING, description: "Full legal name of the supplier/vendor" },
    supplier_trn: { type: SchemaType.STRING, description: "Supplier's Tax Registration Number (TRN) — UAE 15-digit number" },
    buyer_name: { type: SchemaType.STRING, description: "Full legal name of the buyer" },
    buyer_trn: { type: SchemaType.STRING, description: "Buyer's Tax Registration Number (TRN)" },
    invoice_number: { type: SchemaType.STRING, description: "Invoice or document number" },
    invoice_date: { type: SchemaType.STRING, description: "Invoice date in YYYY-MM-DD format" },
    due_date: { type: SchemaType.STRING, description: "Payment due date in YYYY-MM-DD format, null if not found" },
    currency: { type: SchemaType.STRING, description: "3-letter currency code (e.g. AED, USD)" },
    place_of_supply: { type: SchemaType.STRING, description: "Place of supply (UAE emirate name if applicable)" },
    matched_party_id: { type: SchemaType.STRING, description: "If available masters are provided, the best matching party ID for the supplier/buyer, else null" },
    document_type: {
      type: SchemaType.STRING,
      format: "enum",
      description: "Type of document",
      enum: ["invoice", "bill", "receipt", "credit_note", "unknown"],
    },
    line_items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING, description: "Item or service description" },
          quantity: { type: SchemaType.NUMBER, description: "Quantity, default 1" },
          unit_price: { type: SchemaType.NUMBER, description: "Price per unit" },
          tax_rate: { type: SchemaType.NUMBER, description: "VAT/tax rate percentage (e.g. 5 for 5%)" },
          amount: { type: SchemaType.NUMBER, description: "Line total including tax" },
          confidence: { type: SchemaType.NUMBER, description: "Confidence score 0.0-1.0 for this line" },
          matched_item_id: { type: SchemaType.STRING, description: "If available items are provided, the ID of the best matching item" },
          matched_account_id: { type: SchemaType.STRING, description: "If available accounts are provided, the ID of the best matching ledger account" },
        },
        required: ["description", "quantity", "unit_price", "amount", "confidence"],
      },
    },
    subtotal: { type: SchemaType.NUMBER, description: "Subtotal before tax" },
    tax_total: { type: SchemaType.NUMBER, description: "Total tax amount" },
    grand_total: { type: SchemaType.NUMBER, description: "Grand total including tax" },
    overall_confidence: {
      type: SchemaType.NUMBER,
      description: "Overall extraction confidence 0.0-1.0. Set lower if document is blurry, handwritten, or partially obscured.",
    },
    field_confidence: {
      type: SchemaType.OBJECT,
      description: "Per-field confidence scores (0.0-1.0)",
      properties: {
        supplier_name: { type: SchemaType.NUMBER },
        supplier_trn: { type: SchemaType.NUMBER },
        invoice_number: { type: SchemaType.NUMBER },
        invoice_date: { type: SchemaType.NUMBER },
        due_date: { type: SchemaType.NUMBER },
        line_items: { type: SchemaType.NUMBER },
        totals: { type: SchemaType.NUMBER },
      },
    },
  },
  required: [
    "supplier_name", "invoice_number", "invoice_date", "currency",
    "document_type", "line_items", "subtotal", "tax_total", "grand_total",
    "overall_confidence", "field_confidence",
  ],
} satisfies Schema;

// ---------------------------------------------------------------------------
// Extraction Prompt
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are an expert accountant's assistant specialized in UAE tax invoices and FTA compliance.

Analyze this document image/PDF and extract ALL invoice details with precision.

RULES:
1. Extract the supplier name, TRN (15-digit UAE Tax Registration Number), invoice number, dates, and all line items.
2. If a field is not visible or unclear, set its value to null and its confidence to 0.0.
3. For amounts, always use the numeric value without currency symbols.
4. For dates, always use YYYY-MM-DD format.
5. For UAE documents, the default currency is AED unless explicitly stated otherwise.
6. Pay special attention to the VAT rate — UAE standard rate is 5%.
7. The tax_rate field should be the percentage value (e.g. 5 for 5%, not 0.05).
8. Set overall_confidence based on document clarity and completeness:
   - 0.9+ for clear, complete, well-structured invoices
   - 0.7-0.9 for mostly readable documents with minor issues
   - 0.5-0.7 for partially readable or handwritten documents
   - Below 0.5 for very poor quality or largely unreadable documents
9. NEVER fabricate data. If you cannot read a value, set it to null.
10. For each line item, set individual confidence based on how clearly you can read it.
11. If "Available Masters" context is provided, you MUST attempt to semantically match the extracted supplier/buyer against the Parties list and output their ID in matched_party_id.
12. Likewise, match each line item against the Items list (output matched_item_id) or the Accounts list (output matched_account_id) if it represents a service/expense ledger.`;

// ---------------------------------------------------------------------------
// Main Extraction Function
// ---------------------------------------------------------------------------

/**
 * Extract invoice data from a document using Gemini Vision API.
 *
 * @param fileBuffer - The file content as a Buffer or Uint8Array
 * @param mimeType - The MIME type of the file (application/pdf, image/jpeg, etc.)
 * @returns ExtractionResult with structured invoice data
 */
export async function extractInvoiceFromDocument(
  fileBuffer: Uint8Array,
  mimeType: string,
  availableMasters?: AvailableMasters
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const modelName = "gemini-2.5-flash";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      data: null,
      raw_response: null,
      model_used: modelName,
      processing_time_ms: Date.now() - startTime,
      error: "GEMINI_API_KEY is not configured. Add it to your .env.local file.",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: INVOICE_SCHEMA,
        temperature: 0.1, // Low temperature for factual extraction
      },
    });

    // Convert file to base64
    const base64Data = Buffer.from(fileBuffer).toString("base64");
    
    let promptContext = EXTRACTION_PROMPT;
    if (availableMasters) {
      promptContext += `\n\n--- AVAILABLE MASTERS CONTEXT ---\n`;
      promptContext += `Parties:\n${JSON.stringify(availableMasters.parties, null, 2)}\n\n`;
      promptContext += `Items:\n${JSON.stringify(availableMasters.items, null, 2)}\n\n`;
      promptContext += `Accounts:\n${JSON.stringify(availableMasters.accounts, null, 2)}\n`;
      promptContext += `Use these to set matched_party_id, matched_item_id, and matched_account_id where appropriate.`;
    }

    const result = await model.generateContent([
      promptContext,
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText) as ExtractedInvoice;

    // Safety: Clamp confidence to valid range
    parsed.overall_confidence = Math.max(0, Math.min(1, parsed.overall_confidence ?? 0));

    // Safety: Ensure line items have valid confidence
    if (parsed.line_items) {
      parsed.line_items = parsed.line_items.map((item) => ({
        ...item,
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0)),
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        tax_rate: item.tax_rate ?? 0,
        amount: item.amount ?? 0,
      }));
    }

    return {
      success: true,
      data: parsed,
      raw_response: parsed,
      model_used: modelName,
      processing_time_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      raw_response: null,
      model_used: modelName,
      processing_time_ms: Date.now() - startTime,
      error: `Gemini API error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
