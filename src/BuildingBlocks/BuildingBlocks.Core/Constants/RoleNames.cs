namespace BuildingBlocks.Core.Constants;

/// <summary>
/// Konstanta role bawaan dan role organisasi perusahaan yang dikenali lintas microservice.
/// SuperAdmin lolos seluruh pengecekan permission di semua microservice.
/// </summary>
public static class RoleNames
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string ITLead = "ITLead";
    public const string HRManager = "HRManager";
    public const string HRSupervisor = "HRSupervisor";
    public const string HRStaff = "HRStaff";
    public const string FinanceDirector = "FinanceDirector";
    public const string Staff = "Staff";
    public const string Viewer = "Viewer";

    public static readonly string[] All =
    [
        SuperAdmin,
        Admin,
        Manager,
        ITLead,
        HRManager,
        HRSupervisor,
        HRStaff,
        FinanceDirector,
        Staff,
        Viewer
    ];
}
