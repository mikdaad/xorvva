using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Xorva.API.Dashboard;
using Xorva.API.Filters;
using Xorva.Core.Common;
using Xorva.Core.Enums;

namespace Xorva.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly DashboardService _dashboard;

    public DashboardController(DashboardService dashboard)
    {
        _dashboard = dashboard;
    }

    /// <summary>Role-shaped dashboard summary for the caller (one round-trip).</summary>
    [HttpGet("dashboard")]
    [ProducesResponseType(typeof(ApiResponse<DashboardDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken ct)
        => Ok(ApiResponse<DashboardDto>.Ok(await _dashboard.BuildAsync(ct)));

    /// <summary>Platform overview — SystemAdmin (Xorva team) only.</summary>
    [HttpGet("admin/overview")]
    [RequireRole(SystemRole.SystemAdmin)]
    [ProducesResponseType(typeof(ApiResponse<AdminOverviewDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AdminOverview(CancellationToken ct)
        => Ok(ApiResponse<AdminOverviewDto>.Ok(await _dashboard.BuildAdminOverviewAsync(ct)));
}
