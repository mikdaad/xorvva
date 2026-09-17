using FluentAssertions;
using Xorva.Core.Approvals;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;
using Xorva.Modules.HR.Commands.PostPayRun;

namespace Xorva.Tests.Unit.Accounting;

public class ApprovableActionsTests
{
    private static void AssertApprovable(IApprovableAction action, string expectedKey, Guid companyId)
    {
        action.ApprovalActionKey.Should().Be(expectedKey);
        action.ApprovalCompanyId.Should().Be(companyId);          // routes to the target company's rule
        action.ApprovalSummary.Should().NotBeNullOrWhiteSpace();  // shown to approvers
    }

    [Fact]
    public void MoneyActions_AreApprovable_WithStableKeys()
    {
        var cid = Guid.NewGuid();
        AssertApprovable(new PostInvoiceCommand { CompanyId = cid }, "Accounting.PostInvoice", cid);
        AssertApprovable(new PostBillCommand { CompanyId = cid }, "Accounting.PostBill", cid);
        AssertApprovable(new RecordCustomerPaymentCommand { CompanyId = cid }, "Accounting.RecordPayment", cid);
        AssertApprovable(new RecordSupplierPaymentCommand { CompanyId = cid }, "Accounting.RecordSupplierPayment", cid);
        AssertApprovable(new CreateManualJournalCommand { CompanyId = cid }, "Accounting.ManualJournal", cid);
        AssertApprovable(new PostPayRunCommand { CompanyId = cid }, "Accounting.RunPayroll", cid);
    }

    [Fact]
    public void PaymentSummary_IncludesAllocatedAmount()
    {
        var cmd = new RecordCustomerPaymentCommand
        {
            Allocations = [new() { InvoiceId = Guid.NewGuid(), Amount = 2500 }, new() { InvoiceId = Guid.NewGuid(), Amount = 500 }],
        };
        cmd.ApprovalSummary.Should().Contain("3000");
    }
}
