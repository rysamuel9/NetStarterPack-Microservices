namespace BuildingBlocks.Core.Constants;

/// <summary>
/// Registry kode template notifikasi lintas microservice agar tidak ada magic string yang rawan typo.
/// Setiap kode dipetakan ke file HTML default di Notification.Api/Infrastructure/Templating/EmailTemplates/
/// serta dapat di-override dari database melalui UI Notification Templates.
/// </summary>
public static class NotificationTemplateCodes
{
    public const string WorkflowSubmitted = "WORKFLOW_SUBMITTED";
    public const string WorkflowApproved = "WORKFLOW_APPROVED";
    public const string WorkflowRejected = "WORKFLOW_REJECTED";
    public const string WorkflowRevision = "WORKFLOW_REVISION";

    public const string OrderCreated = "ORDER_CREATED";
    public const string OrderStatusChanged = "ORDER_STATUS_CHANGED";

    public const string TrackingAssigned = "TRACKING_ASSIGNED";
    public const string TrackingPodSubmitted = "TRACKING_POD_SUBMITTED";

    public const string AnnouncementPublished = "ANNOUNCEMENT_PUBLISHED";

    public const string Generic = "GENERIC_NOTIFICATION";
}

/// <summary>
/// Kategori notifikasi standar untuk pengelompokan inbox dan preferensi channel (In-App / Email / Push) per user.
/// </summary>
public static class NotificationCategories
{
    public const string Workflow = "Workflow";
    public const string Order = "Order";
    public const string Tracking = "Tracking";
    public const string Announcement = "Announcement";
    public const string System = "System";

    public static IReadOnlyList<string> All => [Workflow, Order, Tracking, Announcement, System];
}
