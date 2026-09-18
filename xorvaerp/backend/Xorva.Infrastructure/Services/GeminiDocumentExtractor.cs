using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Xorva.Modules.Accounting.Documents.Services;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Gemini 2.5 Flash structured-output extractor — port of TrueLedge <c>lib/ai/gemini.ts</c> onto the REST API
/// (no SDK dependency). Same schema, same 12-rule prompt, temperature 0.1, inline base64 document.
/// Configuration: <c>Gemini:ApiKey</c> (required to enable), <c>Gemini:Model</c> (default gemini-2.5-flash),
/// <c>Gemini:Endpoint</c> (default https://generativelanguage.googleapis.com/v1beta).
/// Confidence values are clamped to 0–1 and line-item defaults applied before the JSON reaches the database.
/// </summary>
public sealed class GeminiDocumentExtractor : IDocumentExtractor
{
    private readonly HttpClient _http;
    private readonly ILogger<GeminiDocumentExtractor> _log;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly string _endpoint;

    public GeminiDocumentExtractor(HttpClient http, IConfiguration configuration, ILogger<GeminiDocumentExtractor> log)
    {
        _http = http;
        _log = log;
        _apiKey = configuration["Gemini:ApiKey"];
        _model = configuration["Gemini:Model"] ?? "gemini-2.5-flash";
        _endpoint = (configuration["Gemini:Endpoint"] ?? "https://generativelanguage.googleapis.com/v1beta").TrimEnd('/');
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<DocumentExtractionResult> ExtractInvoiceAsync(byte[] content, string mimeType, ExtractionMasters? masters, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        if (!IsConfigured)
            return new DocumentExtractionResult(false, null, null, _model, null, 0, "Gemini:ApiKey is not configured. Add it to appsettings or the environment.");

        try
        {
            var prompt = ExtractionPrompt;
            if (masters is not null)
            {
                var opts = new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
                prompt += "\n\n--- AVAILABLE MASTERS CONTEXT ---\n"
                        + $"Parties:\n{JsonSerializer.Serialize(masters.Parties, opts)}\n\n"
                        + $"Items:\n{JsonSerializer.Serialize(masters.Items, opts)}\n\n"
                        + $"Accounts:\n{JsonSerializer.Serialize(masters.Accounts, opts)}\n"
                        + "Use these to set matched_party_id, matched_item_id, and matched_account_id where appropriate.";
            }

            var body = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new object[]
                        {
                            new { text = prompt },
                            new { inline_data = new { mime_type = mimeType, data = Convert.ToBase64String(content) } },
                        },
                    },
                },
                generationConfig = new
                {
                    responseMimeType = "application/json",
                    responseSchema = InvoiceSchema,
                    temperature = 0.1,
                },
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_endpoint}/models/{_model}:generateContent")
            {
                Content = JsonContent.Create(body),
            };
            request.Headers.Add("x-goog-api-key", _apiKey);

            using var response = await _http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("Gemini returned {Status}: {Body}", (int)response.StatusCode, Truncate(raw));
                return new DocumentExtractionResult(false, null, raw, _model, null, (int)sw.ElapsedMilliseconds,
                    $"Gemini API error ({(int)response.StatusCode}). Check the API key and quota.");
            }

            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var modelVersion = root.TryGetProperty("modelVersion", out var mv) ? mv.GetString() : null;
            var text = root.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString()
                       ?? throw new InvalidOperationException("Empty model response.");

            var parsed = JsonNode.Parse(text)?.AsObject() ?? throw new InvalidOperationException("Model did not return a JSON object.");
            Sanitise(parsed);

            var extracted = JsonSerializer.SerializeToElement(parsed);
            return new DocumentExtractionResult(true, extracted, raw, _model, modelVersion, (int)sw.ElapsedMilliseconds, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogError(ex, "Gemini extraction failed");
            return new DocumentExtractionResult(false, null, null, _model, null, (int)sw.ElapsedMilliseconds, $"Gemini API error: {ex.Message}");
        }
    }

    /// <summary>Clamp confidences to 0–1 and default numeric line fields — mirrors the TS safety block.</summary>
    private static void Sanitise(JsonObject parsed)
    {
        parsed["overall_confidence"] = Clamp(parsed["overall_confidence"]);
        if (parsed["line_items"] is JsonArray items)
        {
            foreach (var node in items)
            {
                if (node is not JsonObject item) continue;
                item["confidence"] = Clamp(item["confidence"]);
                item["quantity"] = Num(item["quantity"], 1);
                item["unit_price"] = Num(item["unit_price"], 0);
                item["tax_rate"] = Num(item["tax_rate"], 0);
                item["amount"] = Num(item["amount"], 0);
            }
        }
        else parsed["line_items"] = new JsonArray();

        static double Num(JsonNode? n, double fallback) =>
            n is JsonValue v && v.TryGetValue<double>(out var d) ? d : fallback;
        static double Clamp(JsonNode? n) => Math.Clamp(Num(n, 0), 0, 1);
    }

    private static string Truncate(string s) => s.Length <= 500 ? s : s[..500] + "…";

    private const string ExtractionPrompt = """
        You are an expert accountant's assistant specialized in UAE tax invoices and FTA compliance.

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
        12. Likewise, match each line item against the Items list (output matched_item_id) or the Accounts list (output matched_account_id) if it represents a service/expense ledger.
        """;

    /// <summary>TrueLedge INVOICE_SCHEMA, expressed as the REST API's OpenAPI-subset schema object.</summary>
    private static readonly object InvoiceSchema = new
    {
        type = "OBJECT",
        properties = new Dictionary<string, object>
        {
            ["supplier_name"] = S("Full legal name of the supplier/vendor"),
            ["supplier_trn"] = S("Supplier's Tax Registration Number (TRN) — UAE 15-digit number"),
            ["buyer_name"] = S("Full legal name of the buyer"),
            ["buyer_trn"] = S("Buyer's Tax Registration Number (TRN)"),
            ["invoice_number"] = S("Invoice or document number"),
            ["invoice_date"] = S("Invoice date in YYYY-MM-DD format"),
            ["due_date"] = S("Payment due date in YYYY-MM-DD format, null if not found"),
            ["currency"] = S("3-letter currency code (e.g. AED, USD)"),
            ["place_of_supply"] = S("Place of supply (UAE emirate name if applicable)"),
            ["matched_party_id"] = S("If available masters are provided, the best matching party ID for the supplier/buyer, else null"),
            ["document_type"] = new { type = "STRING", format = "enum", description = "Type of document", @enum = new[] { "invoice", "bill", "receipt", "credit_note", "unknown" } },
            ["line_items"] = new
            {
                type = "ARRAY",
                items = new
                {
                    type = "OBJECT",
                    properties = new Dictionary<string, object>
                    {
                        ["description"] = S("Item or service description"),
                        ["quantity"] = N("Quantity, default 1"),
                        ["unit_price"] = N("Price per unit"),
                        ["tax_rate"] = N("VAT/tax rate percentage (e.g. 5 for 5%)"),
                        ["amount"] = N("Line total including tax"),
                        ["confidence"] = N("Confidence score 0.0-1.0 for this line"),
                        ["matched_item_id"] = S("If available items are provided, the ID of the best matching item"),
                        ["matched_account_id"] = S("If available accounts are provided, the ID of the best matching ledger account"),
                    },
                    required = new[] { "description", "quantity", "unit_price", "amount", "confidence" },
                },
            },
            ["subtotal"] = N("Subtotal before tax"),
            ["tax_total"] = N("Total tax amount"),
            ["grand_total"] = N("Grand total including tax"),
            ["overall_confidence"] = N("Overall extraction confidence 0.0-1.0. Set lower if document is blurry, handwritten, or partially obscured."),
            ["field_confidence"] = new
            {
                type = "OBJECT",
                description = "Per-field confidence scores (0.0-1.0)",
                properties = new Dictionary<string, object>
                {
                    ["supplier_name"] = new { type = "NUMBER" }, ["supplier_trn"] = new { type = "NUMBER" }, ["invoice_number"] = new { type = "NUMBER" },
                    ["invoice_date"] = new { type = "NUMBER" }, ["due_date"] = new { type = "NUMBER" }, ["line_items"] = new { type = "NUMBER" }, ["totals"] = new { type = "NUMBER" },
                },
            },
        },
        required = new[]
        {
            "supplier_name", "invoice_number", "invoice_date", "currency", "document_type", "line_items",
            "subtotal", "tax_total", "grand_total", "overall_confidence", "field_confidence",
        },
    };

    private static object S(string description) => new { type = "STRING", description };
    private static object N(string description) => new { type = "NUMBER", description };
}
