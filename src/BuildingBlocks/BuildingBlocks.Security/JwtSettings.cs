namespace BuildingBlocks.Security;

public class JwtSettings
{
    public const string SectionName = "JwtSettings";

    public string Issuer { get; set; } = "NetStarterPack.Microservices";
    public string Audience { get; set; } = "NetStarterPack.Client";
    public string SecretKey { get; set; } = "SuperSecretStarterPackJwtSigningKey_2026_ChangeInProduction_Min32Chars!";
    public int AccessTokenExpirationMinutes { get; set; } = 120;
    public int RefreshTokenExpirationDays { get; set; } = 7;
    public string InternalApiKey { get; set; } = "InternalMicroserviceKey_2026_ZeroTrust";
}
