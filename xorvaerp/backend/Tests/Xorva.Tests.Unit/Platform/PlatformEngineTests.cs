using System.Text.Json;
using FluentAssertions;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Platform.Commands.CreateCustomRecord;
using Xorva.Modules.Platform.Commands.CreateEntityDefinition;
using Xorva.Modules.Platform.Enums;
using Xorva.Modules.Platform.Queries.ListCustomRecords;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Platform;

/// <summary>
/// Unit tests for the dynamic-entity engine: an Admin defines a custom sub-module, then
/// records are created against it, validated against the field definitions, and listed.
/// This proves the "admin adds their own module + forms, no code" path end-to-end.
/// </summary>
public class PlatformEngineTests : AuthHandlerTestBase
{
    private static JsonElement J(object value) => JsonSerializer.SerializeToElement(value);

    private (Guid tenantId, Guid companyId) ActAsAdmin()
    {
        var tenant = SeedTenant();
        var company = SeedCompany(tenant.Id);
        var admin = SeedUser("admin@t.co", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: company.Id);
        ActAs(admin);
        return (tenant.Id, company.Id);
    }

    [Fact]
    public async Task CreateDefinition_SlugsFieldKeys_AndPersistsFields()
    {
        ActAsAdmin();
        var handler = new CreateEntityDefinitionHandler(Db, TenantService);

        var res = await handler.Handle(new CreateEntityDefinitionCommand
        {
            Label = "Training Record",
            ModuleKey = "HR",
            Fields =
            [
                new FieldInput("Course Name", FieldType.Text, IsRequired: true),
                new FieldInput("Score", FieldType.Number),
            ]
        }, default);

        res.Success.Should().BeTrue();
        res.Data!.Key.Should().Be("training_record");
        res.Data.Fields.Should().HaveCount(2);
        res.Data.Fields[0].Key.Should().Be("course_name");
        res.Data.Fields[0].IsRequired.Should().BeTrue();
        res.Data.Fields[1].Key.Should().Be("score");
    }

    [Fact]
    public async Task CreateRecord_WithValidData_PersistsAndLists()
    {
        var (_, companyId) = ActAsAdmin();
        var def = (await new CreateEntityDefinitionHandler(Db, TenantService).Handle(new CreateEntityDefinitionCommand
        {
            Label = "Training Record", ModuleKey = "HR",
            Fields = [new FieldInput("Course Name", FieldType.Text, IsRequired: true), new FieldInput("Score", FieldType.Number)]
        }, default)).Data!;

        var create = await new CreateCustomRecordHandler(Db, TenantService).Handle(new CreateCustomRecordCommand
        {
            EntityDefinitionId = def.Id,
            CompanyId = companyId,
            Data = new() { ["course_name"] = J("Welding 101"), ["score"] = J(95) }
        }, default);

        create.Success.Should().BeTrue();
        create.Data!.Data.GetProperty("course_name").GetString().Should().Be("Welding 101");

        var list = await new ListCustomRecordsHandler(Db).Handle(new ListCustomRecordsQuery(def.Id), default);
        list.Data.Should().HaveCount(1);
    }

    [Fact]
    public async Task CreateRecord_MissingRequiredField_Throws()
    {
        var (_, companyId) = ActAsAdmin();
        var def = (await new CreateEntityDefinitionHandler(Db, TenantService).Handle(new CreateEntityDefinitionCommand
        {
            Label = "Training Record", ModuleKey = "HR",
            Fields = [new FieldInput("Course Name", FieldType.Text, IsRequired: true)]
        }, default)).Data!;

        var act = () => new CreateCustomRecordHandler(Db, TenantService).Handle(new CreateCustomRecordCommand
        {
            EntityDefinitionId = def.Id,
            CompanyId = companyId,
            Data = new() { ["score"] = J(95) } // required "course_name" omitted
        }, default);

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*Course Name*required*");
    }
}
