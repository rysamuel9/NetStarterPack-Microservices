using MasterData.Api.Application.DTOs;
using MasterData.Api.Application.Services;
using MasterData.Api.Domain.Entities;
using MasterData.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.MasterData;

public class LookupServiceTests
{
    private static MasterDataDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<MasterDataDbContext>()
            .UseInMemoryDatabase($"MasterDataTestDb_{Guid.NewGuid():N}")
            .Options;
        return new MasterDataDbContext(options);
    }

    [Fact]
    public async Task CreateAndQueryLookup_ShouldNormalizeCodes_InvalidateCache_AndPublishAuditEvent()
    {
        await using var db = CreateDbContext();
        var uow = new MasterDataUnitOfWork(db);
        var cache = TestCacheFactory.CreateInMemory();
        var currentUser = new FakeCurrentUserService { Username = "superadmin" };
        var eventBus = new InMemoryEventBus();
        var service = new LookupService(uow, cache, currentUser, eventBus);

        // Pre-warm empty cache for PRODUCT_CATEGORY
        var before = await service.GetLookupsAsync("PRODUCT_CATEGORY", activeOnly: true);
        Assert.True(before.Succeeded);
        Assert.Empty(before.Data!);

        // Create with mixed case + spaces
        var created = await service.CreateAsync(new CreateOrUpdateLookupRequest(
            GroupCode: "product category",
            Code: "cloud infra",
            Name: "Cloud & Infrastructure",
            Description: "Layanan cloud",
            SortOrder: 1,
            IsActive: true,
            MetadataJson: "{\"color\":\"teal\"}"));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);
        Assert.Equal("PRODUCT_CATEGORY", created.Data!.GroupCode);
        Assert.Equal("CLOUD_INFRA", created.Data!.Code);

        // Cache harus sudah ter-invalidate sehingga query berikutnya langsung melihat item baru
        var after = await service.GetLookupsAsync("PRODUCT_CATEGORY", activeOnly: true);
        Assert.True(after.Succeeded);
        Assert.Single(after.Data!);
        Assert.Equal("CLOUD_INFRA", after.Data![0].Code);

        // Audit event terkirim ke Identity.Api via EventBus
        Assert.Single(eventBus.PublishedEvents);
        Assert.Equal("MasterData.Api", eventBus.PublishedEvents[0].SourceService);
        Assert.Equal("CREATE_LOOKUP", eventBus.PublishedEvents[0].Action);
    }

    [Fact]
    public async Task CreateLookup_WithDuplicateGroupAndCode_OrInvalidJson_ShouldReturnError()
    {
        await using var db = CreateDbContext();
        var service = new LookupService(
            new MasterDataUnitOfWork(db),
            TestCacheFactory.CreateInMemory(),
            new FakeCurrentUserService(),
            new InMemoryEventBus());

        var first = await service.CreateAsync(new CreateOrUpdateLookupRequest("UNIT_OF_MEASURE", "PCS", "Pieces"));
        Assert.True(first.Succeeded);

        var dup = await service.CreateAsync(new CreateOrUpdateLookupRequest("unit_of_measure", "pcs", "Duplicate"));
        Assert.False(dup.Succeeded);
        Assert.Equal(409, dup.StatusCode);

        var badJson = await service.CreateAsync(new CreateOrUpdateLookupRequest(
            "UNIT_OF_MEASURE", "BOX", "Box", MetadataJson: "not-valid-json"));
        Assert.False(badJson.Succeeded);
        Assert.Equal(400, badJson.StatusCode);
    }

    [Fact]
    public async Task BatchAndCascadingLookup_ShouldFilterActiveOnly_AndSupportParentChildHierarchy()
    {
        await using var db = CreateDbContext();
        var parent = new MasterLookup
        {
            GroupCode = "DOCUMENT_TYPE",
            Code = "INTERNAL",
            Name = "Dokumen Internal",
            SortOrder = 1,
            IsActive = true,
            IsSystem = true
        };
        var childActive = new MasterLookup
        {
            GroupCode = "DOCUMENT_TYPE",
            Code = "SOP",
            Name = "SOP",
            ParentId = parent.Id,
            SortOrder = 2,
            IsActive = true
        };
        var childInactive = new MasterLookup
        {
            GroupCode = "DOCUMENT_TYPE",
            Code = "OLD_MEMO",
            Name = "Memo Lama",
            ParentId = parent.Id,
            SortOrder = 3,
            IsActive = false
        };
        var prodCat = new MasterLookup
        {
            GroupCode = "PRODUCT_CATEGORY",
            Code = "HARDWARE",
            Name = "Hardware",
            SortOrder = 1,
            IsActive = true
        };

        await db.MasterLookups.AddRangeAsync(parent, childActive, childInactive, prodCat);
        await db.SaveChangesAsync();

        var service = new LookupService(
            new MasterDataUnitOfWork(db),
            TestCacheFactory.CreateInMemory(),
            new FakeCurrentUserService(),
            new InMemoryEventBus());

        // Cascading filter by ParentId + activeOnly
        var children = await service.GetLookupsAsync("DOCUMENT_TYPE", activeOnly: true, parentId: parent.Id);
        Assert.True(children.Succeeded);
        Assert.Single(children.Data!);
        Assert.Equal("SOP", children.Data![0].Code);
        Assert.Equal("Dokumen Internal", children.Data![0].ParentName);

        // Batch endpoint
        var batch = await service.GetBatchLookupsAsync(["PRODUCT_CATEGORY", "DOCUMENT_TYPE", "NON_EXISTENT"], activeOnly: true);
        Assert.True(batch.Succeeded);
        Assert.Equal(3, batch.Data!.Count);
        Assert.Single(batch.Data["PRODUCT_CATEGORY"]);
        Assert.Equal(2, batch.Data["DOCUMENT_TYPE"].Count); // parent + childActive (childInactive excluded)
        Assert.Empty(batch.Data["NON_EXISTENT"]);
    }

    [Fact]
    public async Task SystemItemAndParentItem_ShouldBlockDeletion_WhileAllowingToggleStatusAndSoftDeleteOnCustomLeaf()
    {
        await using var db = CreateDbContext();
        var systemItem = new MasterLookup
        {
            GroupCode = "PRODUCT_CATEGORY",
            Code = "CLOUD_INFRA",
            Name = "Cloud & Infrastructure",
            IsActive = true,
            IsSystem = true
        };
        var customParent = new MasterLookup
        {
            GroupCode = "REGION",
            Code = "JABAR",
            Name = "Jawa Barat",
            IsActive = true,
            IsSystem = false
        };
        var customChild = new MasterLookup
        {
            GroupCode = "REGION",
            Code = "BANDUNG",
            Name = "Bandung",
            ParentId = customParent.Id,
            IsActive = true,
            IsSystem = false
        };

        await db.MasterLookups.AddRangeAsync(systemItem, customParent, customChild);
        await db.SaveChangesAsync();

        var service = new LookupService(
            new MasterDataUnitOfWork(db),
            TestCacheFactory.CreateInMemory(),
            new FakeCurrentUserService(),
            new InMemoryEventBus());

        // System item cannot be deleted or have Code changed
        var deleteSystem = await service.DeleteAsync(systemItem.Id);
        Assert.False(deleteSystem.Succeeded);
        Assert.Equal(400, deleteSystem.StatusCode);

        var renameSystemCode = await service.UpdateAsync(systemItem.Id, new CreateOrUpdateLookupRequest("PRODUCT_CATEGORY", "RENAMED", "Cloud"));
        Assert.False(renameSystemCode.Succeeded);
        Assert.Equal(400, renameSystemCode.StatusCode);

        // System item CAN be toggled inactive
        var toggled = await service.ToggleStatusAsync(systemItem.Id, false);
        Assert.True(toggled.Succeeded);
        Assert.False(toggled.Data!.IsActive);

        // Parent with children cannot be deleted
        var deleteParent = await service.DeleteAsync(customParent.Id);
        Assert.False(deleteParent.Succeeded);
        Assert.Equal(400, deleteParent.StatusCode);

        // Delete child first -> then parent can be deleted
        var deleteChild = await service.DeleteAsync(customChild.Id);
        Assert.True(deleteChild.Succeeded);

        var deleteParentAfter = await service.DeleteAsync(customParent.Id);
        Assert.True(deleteParentAfter.Succeeded);
    }
}
