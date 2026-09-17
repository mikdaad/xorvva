using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.ListCompanies;

/// <summary>
/// Role-scoped company list:
/// SuperAdmin → all companies in tenant; everyone else → only their own company.
/// </summary>
public record ListCompaniesQuery : IRequest<ApiResponse<List<CompanyDto>>>;
