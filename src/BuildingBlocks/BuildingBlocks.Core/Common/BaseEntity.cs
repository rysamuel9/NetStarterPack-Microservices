namespace BuildingBlocks.Core.Common;

/// <summary>
/// Class dasar untuk seluruh domain entity di semua microservice (Onion Core).
/// Menyediakan kolom standar auditing dan soft-delete.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? CreatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; } = false;
}
