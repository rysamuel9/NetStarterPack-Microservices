namespace BuildingBlocks.Core.Constants;

/// <summary>
/// Konstanta role bawaan yang dikenali lintas microservice.
/// SuperAdmin lolos seluruh pengecekan permission di semua microservice.
/// </summary>
public static class RoleNames
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Staff = "Staff";
    public const string Viewer = "Viewer";

    public static readonly string[] All =
    [
        SuperAdmin,
        Admin,
        Manager,
        Staff,
        Viewer
    ];
}
