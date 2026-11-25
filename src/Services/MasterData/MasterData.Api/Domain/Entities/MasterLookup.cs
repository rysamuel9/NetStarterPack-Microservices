using BuildingBlocks.Core.Common;

namespace MasterData.Api.Domain.Entities;

/// <summary>
/// Entitas tunggal Unified Lookup / General Code Table (Database: NetStarterPack_MasterDataDb).
/// Menampung berbagai grup referensi dropdown lintas microservice (misal PRODUCT_CATEGORY, UNIT_OF_MEASURE, PAYMENT_METHOD, dll.)
/// lengkap dengan dukungan cascading parent-child, urutan tampil, status aktif, proteksi item sistem, dan metadata JSON.
/// </summary>
public class MasterLookup : BaseEntity
{
    public string GroupCode { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? ParentId { get; set; }
    public MasterLookup? Parent { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
    public string? MetadataJson { get; set; }
}
