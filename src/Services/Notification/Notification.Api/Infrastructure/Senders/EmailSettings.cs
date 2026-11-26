namespace Notification.Api.Infrastructure.Senders;

public class EmailProviderProfile
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string Security { get; set; } = "StartTls";
    public string FromName { get; set; } = "NetStarterPack Notifications";
    public string FromEmail { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public bool HasCredentials =>
        !string.IsNullOrWhiteSpace(Host) &&
        !string.IsNullOrWhiteSpace(Username) &&
        !string.IsNullOrWhiteSpace(Password);
}

public class EmailSettings
{
    public const string SectionName = "EmailSettings";

    /// <summary>
    /// Provider aktif: "Office365" (default), "Gmail", atau "Console".
    /// </summary>
    public string ActiveProvider { get; set; } = "Office365";

    /// <summary>
    /// Master switch pengiriman SMTP. Jika false, semua email dicatat sebagai Simulated (dry-run).
    /// </summary>
    public bool EnableSending { get; set; } = true;

    public string AppName { get; set; } = "NetStarterPack";
    public string AppBaseUrl { get; set; } = "http://localhost:5173";

    /// <summary>
    /// Jika diisi (misal "ronysamuel19@gmail.com"), semua email tujuan @starterpack.local atau di mode Dev
    /// akan dialihkan ke alamat ini beserta banner info penerima asli.
    /// </summary>
    public string? DevOverrideRecipient { get; set; } = "ronysamuel19@gmail.com";

    public Dictionary<string, EmailProviderProfile> Providers { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Office365"] = new EmailProviderProfile
        {
            Host = "smtp.office365.com",
            Port = 587,
            Security = "StartTls",
            FromName = "NetStarterPack Notifications"
        },
        ["Gmail"] = new EmailProviderProfile
        {
            Host = "smtp.gmail.com",
            Port = 587,
            Security = "StartTls",
            FromName = "NetStarterPack Notifications"
        }
    };

    public (string Name, EmailProviderProfile? Profile) ResolveActiveProfile()
    {
        if (string.Equals(ActiveProvider, "Console", StringComparison.OrdinalIgnoreCase))
        {
            return ("Console", null);
        }

        if (Providers.TryGetValue(ActiveProvider, out var exact))
        {
            return (ActiveProvider, exact);
        }

        var match = Providers.FirstOrDefault(kvp =>
            kvp.Key.Equals(ActiveProvider, StringComparison.OrdinalIgnoreCase));

        return string.IsNullOrWhiteSpace(match.Key)
            ? (ActiveProvider, null)
            : (match.Key, match.Value);
    }
}

public class PushSettings
{
    public const string SectionName = "PushSettings";

    public bool Enabled { get; set; } = true;
    public string ExpoPushApiUrl { get; set; } = "https://exp.host/--/api/v2/push/send";
    public string? ExpoAccessToken { get; set; }
}
