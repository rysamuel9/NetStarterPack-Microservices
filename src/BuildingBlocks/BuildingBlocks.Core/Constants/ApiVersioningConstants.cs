namespace BuildingBlocks.Core.Constants;

/// <summary>
/// Standar nama header &amp; versi default untuk API Versioning lintas Gateway &amp; Microservice.
/// </summary>
public static class ApiVersioningConstants
{
    public const string DefaultVersion = "1.0";
    public const string VersionHeader = "X-Api-Version";
    public const string VersionQueryParam = "api-version";
    public const string SupportedVersionsHeader = "api-supported-versions";
    public const string DeprecatedVersionsHeader = "api-deprecated-versions";
}
