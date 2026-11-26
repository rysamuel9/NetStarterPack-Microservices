using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;

namespace Notification.Api.Infrastructure.Senders;

/// <summary>
/// Pengirim email standar produksi menggunakan MailKit dengan dukungan preset multi-provider
/// (Office 365 / Microsoft 365 &amp; Gmail StartTLS) serta Dev Override Recipient &amp; safe console simulation.
/// </summary>
public class MailKitEmailSender(
    IOptions<EmailSettings> emailOptions,
    IOptions<PushSettings> pushOptions,
    ILogger<MailKitEmailSender> logger) : IEmailSender
{
    private readonly EmailSettings _settings = emailOptions.Value;
    private readonly PushSettings _pushSettings = pushOptions.Value;

    public async Task<EmailSendResult> SendAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default)
    {
        var effectiveRecipient = ResolveEffectiveRecipient(toEmail);
        var (providerName, profile) = _settings.ResolveActiveProfile();

        if (!_settings.EnableSending ||
            string.Equals(providerName, "Console", StringComparison.OrdinalIgnoreCase) ||
            profile is null ||
            !profile.HasCredentials)
        {
            var reason = !_settings.EnableSending
                ? "EnableSending=false"
                : profile is null
                    ? $"Provider '{providerName}' mode Console/tidak terdaftar"
                    : $"Kredensial SMTP '{providerName}' belum diisi (set lewat dotnet user-secrets atau appsettings.Development.json)";

            logger.LogInformation(
                "[EMAIL SIMULATED - {Provider}] To={EffectiveRecipient} (Original={OriginalRecipient}) | Subject={Subject} | Reason={Reason}",
                providerName,
                effectiveRecipient,
                toEmail,
                subject,
                reason);

            return new EmailSendResult(
                Succeeded: true,
                IsSimulated: true,
                ProviderName: $"{providerName} (Simulated)",
                EffectiveRecipient: effectiveRecipient,
                ErrorMessage: null);
        }

        try
        {
            var fromAddress = string.IsNullOrWhiteSpace(profile.FromEmail) ? profile.Username : profile.FromEmail;
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(profile.FromName, fromAddress));
            message.To.Add(new MailboxAddress(string.IsNullOrWhiteSpace(toName) ? effectiveRecipient : toName, effectiveRecipient));
            message.Subject = subject;

            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = htmlBody,
                TextBody = StripHtmlForPlainText(htmlBody)
            };
            message.Body = bodyBuilder.ToMessageBody();

            var socketOption = profile.Security.ToLowerInvariant() switch
            {
                "sslonconnect" or "ssl" => SecureSocketOptions.SslOnConnect,
                "starttls" or "tls" => SecureSocketOptions.StartTls,
                "none" => SecureSocketOptions.None,
                _ => SecureSocketOptions.StartTlsWhenAvailable
            };

            using var client = new SmtpClient();
            client.Timeout = 15_000;
            await client.ConnectAsync(profile.Host, profile.Port, socketOption, cancellationToken);
            await client.AuthenticateAsync(profile.Username, profile.Password, cancellationToken);
            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(quit: true, cancellationToken);

            logger.LogInformation(
                "[EMAIL SENT - {Provider}] To={EffectiveRecipient} (Original={OriginalRecipient}) | Subject={Subject}",
                providerName,
                effectiveRecipient,
                toEmail,
                subject);

            return new EmailSendResult(
                Succeeded: true,
                IsSimulated: false,
                ProviderName: providerName,
                EffectiveRecipient: effectiveRecipient);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "[EMAIL FAILED - {Provider}] Gagal mengirim ke {EffectiveRecipient} | Subject={Subject}",
                providerName,
                effectiveRecipient,
                subject);

            return new EmailSendResult(
                Succeeded: false,
                IsSimulated: false,
                ProviderName: providerName,
                EffectiveRecipient: effectiveRecipient,
                ErrorMessage: ex.Message);
        }
    }

    public EmailProviderStatusDto GetProviderStatus()
    {
        var profiles = _settings.Providers
            .Select(kvp => new EmailProviderProfileStatusDto(
                Name: kvp.Key,
                Host: kvp.Value.Host,
                Port: kvp.Value.Port,
                Security: kvp.Value.Security,
                FromEmail: string.IsNullOrWhiteSpace(kvp.Value.FromEmail) ? kvp.Value.Username : kvp.Value.FromEmail,
                HasCredentials: kvp.Value.HasCredentials,
                IsActive: kvp.Key.Equals(_settings.ActiveProvider, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(p => p.IsActive)
            .ThenBy(p => p.Name)
            .ToList();

        return new EmailProviderStatusDto(
            ActiveProvider: _settings.ActiveProvider,
            EnableSending: _settings.EnableSending,
            DevOverrideRecipient: _settings.DevOverrideRecipient,
            AppBaseUrl: _settings.AppBaseUrl,
            PushEnabled: _pushSettings.Enabled,
            Profiles: profiles);
    }

    public string ResolveEffectiveRecipient(string originalEmail)
    {
        if (!string.IsNullOrWhiteSpace(_settings.DevOverrideRecipient))
        {
            return _settings.DevOverrideRecipient.Trim();
        }

        return originalEmail.Trim();
    }

    private static string StripHtmlForPlainText(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ");
        text = System.Net.WebUtility.HtmlDecode(text);
        return System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
    }
}
