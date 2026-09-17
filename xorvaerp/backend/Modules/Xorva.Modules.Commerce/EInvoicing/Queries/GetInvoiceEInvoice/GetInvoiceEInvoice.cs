using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.EInvoicing.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.EInvoicing.Queries.GetInvoiceEInvoice;

/// <summary>Generates the UBL 2.1 / PINT AE e-invoice for a posted sales invoice.</summary>
public record GetInvoiceEInvoiceQuery : IRequest<ApiResponse<EInvoiceDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetInvoiceEInvoiceHandler : IRequestHandler<GetInvoiceEInvoiceQuery, ApiResponse<EInvoiceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetInvoiceEInvoiceHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EInvoiceDto>> Handle(GetInvoiceEInvoiceQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var invoice = await _db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Invoice", request.Id);

        if (invoice.Status is DocumentStatus.Draft or DocumentStatus.Voided)
            throw new BadRequestException("Only a posted invoice can be exported as an e-invoice.");

        var buyer = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == invoice.ContactId, ct)
            ?? throw new NotFoundException("Contact", invoice.ContactId);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        var companyName = await _db.Set<Company>().Where(c => c.Id == companyId)
            .Select(c => c.Name).FirstOrDefaultAsync(ct) ?? string.Empty;

        var taxRateIds = invoice.Lines.Where(l => l.TaxRateId.HasValue).Select(l => l.TaxRateId!.Value).Distinct().ToList();
        var taxRates = await _db.Set<TaxRate>().Where(t => taxRateIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);

        var (xml, warnings) = UblInvoiceBuilder.Build(invoice, buyer, settings, companyName, taxRates);

        return ApiResponse<EInvoiceDto>.Ok(new EInvoiceDto
        {
            FileName = $"{invoice.Number}.xml",
            Xml = xml,
            Warnings = warnings,
        });
    }
}
