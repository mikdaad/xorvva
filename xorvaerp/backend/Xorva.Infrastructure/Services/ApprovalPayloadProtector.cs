using Microsoft.AspNetCore.DataProtection;
using Xorva.Core.Interfaces;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Data Protection-backed implementation of <see cref="IApprovalPayloadProtector"/>.
/// The purpose string isolates this protector's key from any other use.
/// </summary>
public class ApprovalPayloadProtector : IApprovalPayloadProtector
{
    private readonly IDataProtector _protector;

    public ApprovalPayloadProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector("Xorva.Approvals.CommandPayload.v1");
    }

    public string Protect(string plaintext) => _protector.Protect(plaintext);

    public string Unprotect(string ciphertext) => _protector.Unprotect(ciphertext);
}
