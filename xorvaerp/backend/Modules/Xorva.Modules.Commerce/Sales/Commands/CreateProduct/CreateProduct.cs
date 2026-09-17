using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Commands.CreateProduct;

public record CreateProductCommand : IRequest<ApiResponse<ProductDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public decimal SalesPrice { get; init; }
    public Guid? SalesAccountId { get; init; }
    public Guid? TaxRateId { get; init; }
    public string? Description { get; init; }
}

public class CreateProductValidator : AbstractValidator<CreateProductCommand>
{
    public CreateProductValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Product name is required.").MaximumLength(150);
        RuleFor(x => x.Code).MaximumLength(30);
        RuleFor(x => x.SalesPrice).GreaterThanOrEqualTo(0);
    }
}

public class CreateProductHandler : IRequestHandler<CreateProductCommand, ApiResponse<ProductDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateProductHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ProductDto>> Handle(CreateProductCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var product = new Product
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Code = request.Code?.Trim(),
            SalesPrice = Math.Round(request.SalesPrice, 2),
            SalesAccountId = request.SalesAccountId,
            TaxRateId = request.TaxRateId,
            Description = request.Description?.Trim(),
            IsActive = true,
        };

        _db.Set<Product>().Add(product);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<ProductDto>.Ok(product.ToDto(), "Product created.");
    }
}
