using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// An uploaded file (passport/visa/certificate scan or photo) referenced by an employee-tab
/// Attachment field. Company-scoped; the bytes live in the DB so it is portable (Neon) and
/// access is auth-gated by the tenant/company query filter.
/// </summary>
public class HrFile : CompanyEntity
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public byte[] Data { get; set; } = [];
}
