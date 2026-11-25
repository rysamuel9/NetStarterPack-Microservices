namespace BuildingBlocks.Core.Constants;

/// <summary>
/// Standar penamaan Cache Key berbasis prefix agar konsisten di In-Memory maupun Shared Redis Cluster.
/// </summary>
public static class CacheKeys
{
    public const string ProductsPrefix = "products:";
    public const string OrdersPrefix = "orders:";
    public const string WorkflowsPrefix = "workflows:";
    public const string AnnouncementsPrefix = "announcements:";
    public const string OrganizationPrefix = "org:";
    public const string MenusPrefix = "menus:";
    public const string RolesPrefix = "roles:";
    public const string UsersPrefix = "users:";
    public const string DashboardPrefix = "dashboard:";
    public const string IdempotencyPrefix = "idempotency:";

    public static string ProductList(string? search, string? category) =>
        $"{ProductsPrefix}list:s={search?.Trim().ToLowerInvariant() ?? "all"}:c={category?.Trim().ToLowerInvariant() ?? "all"}";

    public static string ProductById(Guid id) =>
        $"{ProductsPrefix}id:{id}";

    public static string ProductStats() =>
        $"{ProductsPrefix}stats";

    public static string OrderList(string? search, string? status) =>
        $"{OrdersPrefix}list:s={search?.Trim().ToLowerInvariant() ?? "all"}:st={status?.Trim().ToLowerInvariant() ?? "all"}";

    public static string OrderById(Guid id) =>
        $"{OrdersPrefix}id:{id}";

    public static string OrderStats() =>
        $"{OrdersPrefix}stats";

    public static string WorkflowTemplates() =>
        $"{WorkflowsPrefix}templates:all";

    public static string WorkflowStats() =>
        $"{WorkflowsPrefix}stats";

    public static string AnnouncementStats() =>
        $"{AnnouncementsPrefix}stats";

    public static string OrganizationTree() =>
        $"{OrganizationPrefix}tree";

    public static string AllDirectorates() =>
        $"{OrganizationPrefix}directorates";

    public static string AllDivisions() =>
        $"{OrganizationPrefix}divisions";

    public static string AllDepartments() =>
        $"{OrganizationPrefix}departments";

    public static string AllPositions() =>
        $"{OrganizationPrefix}positions";

    public static string MenusByRoles(IEnumerable<string> roles) =>
        $"{MenusPrefix}roles:{string.Join(",", roles.OrderBy(r => r).Select(r => r.ToLowerInvariant()))}";

    public static string AllMenus() =>
        $"{MenusPrefix}all";

    public static string AllRoles() =>
        $"{RolesPrefix}all";

    public static string AllUsers() =>
        $"{UsersPrefix}all";

    public static string DashboardSummary() =>
        $"{DashboardPrefix}summary";

    public static string AuditLogs(int limit) =>
        $"{DashboardPrefix}auditlogs:{limit}";

    public static string Idempotency(string serviceScope, string userScope, string method, string path, string idempotencyKey) =>
        $"{IdempotencyPrefix}{serviceScope.Trim().ToLowerInvariant()}:{userScope.Trim().ToLowerInvariant()}:{method.Trim().ToUpperInvariant()}:{path.Trim().ToLowerInvariant()}:{idempotencyKey.Trim()}";
}
