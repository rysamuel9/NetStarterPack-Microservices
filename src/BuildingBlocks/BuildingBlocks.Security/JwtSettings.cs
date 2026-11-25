namespace BuildingBlocks.Security;

public class JwtSettings
{
    public const string SectionName = "JwtSettings";
    public const string DefaultSecretKey = "SuperSecretStarterPackJwtSigningKey_2026_ChangeInProduction_Min32Chars!";
    public const string DefaultInternalApiKey = "InternalMicroserviceKey_2026_ZeroTrust";

    public string Issuer { get; set; } = "NetStarterPack.Microservices";
    public string Audience { get; set; } = "NetStarterPack.Client";
    public string SecretKey { get; set; } = DefaultSecretKey;
    public int AccessTokenExpirationMinutes { get; set; } = 30;
    public int RefreshTokenExpirationDays { get; set; } = 7;
    public string InternalApiKey { get; set; } = DefaultInternalApiKey;
    public bool RequireHttpsMetadata { get; set; } = false;

    public bool HasDefaultSecrets() =>
        string.IsNullOrWhiteSpace(SecretKey) ||
        SecretKey.Length < 32 ||
        string.Equals(SecretKey, DefaultSecretKey, StringComparison.Ordinal) ||
        string.IsNullOrWhiteSpace(InternalApiKey) ||
        string.Equals(InternalApiKey, DefaultInternalApiKey, StringComparison.Ordinal);
}
