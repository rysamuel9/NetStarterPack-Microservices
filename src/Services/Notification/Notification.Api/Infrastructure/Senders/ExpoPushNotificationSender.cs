using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Notification.Api.Application.Interfaces;

namespace Notification.Api.Infrastructure.Senders;

/// <summary>
/// Pengirim Mobile Push Notification melalui Expo Push API (Android FCM &amp; iOS APNs lewat 1 endpoint).
/// Untuk token non-Expo (misal token simulasi Expo Go lokal), mencatat status Simulated tanpa error.
/// </summary>
public class ExpoPushNotificationSender(
    HttpClient httpClient,
    IOptions<PushSettings> pushOptions,
    ILogger<ExpoPushNotificationSender> logger) : IPushNotificationSender
{
    private readonly PushSettings _settings = pushOptions.Value;

    public async Task<PushSendResult> SendAsync(
        string pushToken,
        string title,
        string body,
        Dictionary<string, string>? data = null,
        CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled)
        {
            return new PushSendResult(true, true, "ExpoPush (Disabled)", null);
        }

        var trimmedToken = pushToken.Trim();
        var isValidExpoToken =
            trimmedToken.StartsWith("ExponentPushToken[", StringComparison.Ordinal) ||
            trimmedToken.StartsWith("ExpoPushToken[", StringComparison.Ordinal);

        if (!isValidExpoToken)
        {
            logger.LogInformation(
                "[PUSH SIMULATED] Token '{Token}' bukan format ExpoPushToken (kemungkinan mode Expo Go / lokal). Title={Title}",
                trimmedToken,
                title);
            return new PushSendResult(true, true, "ExpoPush (Local/Simulated)");
        }

        try
        {
            var payload = new
            {
                to = trimmedToken,
                title,
                body,
                sound = "default",
                priority = "high",
                channelId = "default",
                data = data ?? new Dictionary<string, string>()
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, _settings.ExpoPushApiUrl)
            {
                Content = JsonContent.Create(payload)
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            if (!string.IsNullOrWhiteSpace(_settings.ExpoAccessToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ExpoAccessToken);
            }

            var response = await httpClient.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return new PushSendResult(
                    Succeeded: false,
                    IsSimulated: false,
                    ProviderName: "ExpoPush",
                    ErrorMessage: $"HTTP {(int)response.StatusCode}: {Truncate(responseBody, 250)}");
            }

            // Cek jika Expo mengembalikan status "error" di ticket JSON
            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                if (doc.RootElement.TryGetProperty("data", out var dataProp))
                {
                    var ticket = dataProp.ValueKind == JsonValueKind.Array && dataProp.GetArrayLength() > 0
                        ? dataProp[0]
                        : dataProp;

                    if (ticket.TryGetProperty("status", out var statusProp) &&
                        string.Equals(statusProp.GetString(), "error", StringComparison.OrdinalIgnoreCase))
                    {
                        var errMsg = ticket.TryGetProperty("message", out var msgProp)
                            ? msgProp.GetString()
                            : "Expo Push mengembalikan ticket error.";
                        return new PushSendResult(false, false, "ExpoPush", errMsg);
                    }
                }
            }
            catch
            {
                // Abaikan parsing tambahan jika HTTP 200 OK
            }

            logger.LogInformation("[PUSH SENT - ExpoPush] Token={Token} | Title={Title}", trimmedToken, title);
            return new PushSendResult(true, false, "ExpoPush");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[PUSH FAILED - ExpoPush] Token={Token} | Title={Title}", trimmedToken, title);
            return new PushSendResult(false, false, "ExpoPush", ex.Message);
        }
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
