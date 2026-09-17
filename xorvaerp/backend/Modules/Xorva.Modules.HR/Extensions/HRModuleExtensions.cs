using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Modules.HR.Commands.ApplyLeave;
using Xorva.Modules.HR.Commands.ChangeEmployeeSalary;
using Xorva.Modules.HR.Commands.ChangeEmployeeStatus;
using Xorva.Modules.HR.Commands.CreateEmployee;
using Xorva.Modules.HR.Commands.PostPayRun;

namespace Xorva.Modules.HR.Extensions;

/// <summary>
/// DI registration for the HR module: MediatR handlers + the approvable actions it
/// exposes (they appear in the rule-builder dropdowns under module "HR").
/// </summary>
public static class HRModuleExtensions
{
    public static IServiceCollection AddHRModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(HRModuleExtensions).Assembly));

        // Business-module actions — only offered to companies with HR activated.
        services.AddSingleton(new ApprovableActionDescriptor(
            "HR", CreateEmployeeCommand.ActionKey, "New Hire (Create Employee)",
            typeof(CreateEmployeeCommand), RequiresModuleActivation: true));

        services.AddSingleton(new ApprovableActionDescriptor(
            "HR", ChangeEmployeeSalaryCommand.ActionKey, "Salary Change",
            typeof(ChangeEmployeeSalaryCommand), RequiresModuleActivation: true));

        services.AddSingleton(new ApprovableActionDescriptor(
            "HR", ChangeEmployeeStatusCommand.ActionKey, "Employee Status / Termination",
            typeof(ChangeEmployeeStatusCommand), RequiresModuleActivation: true));

        services.AddSingleton(new ApprovableActionDescriptor(
            "HR", ApplyLeaveCommand.ActionKey, "Leave Request",
            typeof(ApplyLeaveCommand), RequiresModuleActivation: true));

        // Payroll posting exposes its gross total, so a rule for it may carry an amount threshold.
        services.AddSingleton(new ApprovableActionDescriptor(
            "HR", PostPayRunCommand.ActionKey, "Post Payroll (salary journal)",
            typeof(PostPayRunCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));

        return services;
    }
}
