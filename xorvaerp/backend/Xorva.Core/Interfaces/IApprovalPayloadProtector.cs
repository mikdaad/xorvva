namespace Xorva.Core.Interfaces;

/// <summary>
/// Encrypts the approval engine's stored command payload. The payload can contain
/// sensitive data (a new hire's password, an employee's salary), so it must never
/// sit in the database as plaintext while a request is pending.
/// Backed by ASP.NET Core Data Protection.
/// </summary>
public interface IApprovalPayloadProtector
{
    string Protect(string plaintext);
    string Unprotect(string ciphertext);
}
