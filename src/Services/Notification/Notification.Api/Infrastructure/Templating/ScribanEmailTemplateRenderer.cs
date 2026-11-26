using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;
using Notification.Api.Infrastructure.Senders;
using Scriban;
using Scriban.Runtime;

namespace Notification.Api.Infrastructure.Templating;

/// <summary>
/// Renderer email 2-tahap berbasis Scriban:
/// 1. Merender Subject &amp; Body Partial (dengan auto HTML-encoding pada seluruh variabel user untuk mencegah XSS/HTML injection).
/// 2. Membungkus hasil Body HTML ke dalam 1 Master Layout (_BaseLayout.html) sehingga branding, CTA, dan footer seragam di semua template.
/// </summary>
public class ScribanEmailTemplateRenderer(
    IHostEnvironment hostEnvironment,
    IOptions<EmailSettings> emailOptions,
    ILogger<ScribanEmailTemplateRenderer> logger) : IEmailTemplateRenderer
{
    private readonly EmailSettings _emailSettings = emailOptions.Value;

    private const string FallbackLayout = """
<!DOCTYPE html>
<html lang="id"><body style="font-family:sans-serif;background:#f8fafc;padding:24px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px;">
<h2 style="margin-top:0;color:#0f172a;">{{ app_name }}</h2>
{{ body_content }}
</div></body></html>
""";

    public async Task<RenderedEmailResult> RenderAsync(
        string subjectTemplate,
        string bodyHtmlTemplate,
        string accentColor,
        string actionLabel,
        string? actionUrl,
        Dictionary<string, string> variables,
        string? devRedirectOriginalEmail = null,
        CancellationToken cancellationToken = default)
    {
        var rawVars = new ScriptObject();
        var encodedVars = new ScriptObject();

        foreach (var (key, value) in variables)
        {
            var normalizedKey = key.Trim();
            var safeValue = value ?? string.Empty;
            rawVars[normalizedKey] = safeValue;
            encodedVars[normalizedKey] = WebUtility.HtmlEncode(safeValue);
        }

        // 1. Render Subject (plain text, tidak perlu HTML-encode)
        var renderedSubject = RenderScribanString(subjectTemplate, rawVars, "Subject");

        // 2. Render Body HTML (variabel sudah di-HTML-encode agar catatan user tidak bisa inject HTML/JS)
        var renderedBody = RenderScribanString(bodyHtmlTemplate, encodedVars, "Body");

        // 3. Wrap ke dalam Master _BaseLayout.html
        var layoutHtml = await LoadTemplateFileAsync("_BaseLayout.html", cancellationToken) ?? FallbackLayout;
        var fullActionUrl = BuildAbsoluteActionUrl(actionUrl);
        var wibTime = DateTime.UtcNow.AddHours(7).ToString("dd MMM yyyy, HH:mm") + " WIB";

        var devNotice = !string.IsNullOrWhiteSpace(devRedirectOriginalEmail)
            ? $"Email ini aslinya ditujukan ke {WebUtility.HtmlEncode(devRedirectOriginalEmail)} dan dialihkan ke inbox development Anda."
            : string.Empty;

        var layoutVars = new ScriptObject
        {
            ["subject"] = WebUtility.HtmlEncode(renderedSubject),
            ["app_name"] = WebUtility.HtmlEncode(_emailSettings.AppName),
            ["category"] = WebUtility.HtmlEncode(variables.GetValueOrDefault("category", "Notification")),
            ["accent_color"] = SanitizeHexColor(accentColor),
            ["action_label"] = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(actionLabel) ? "Buka Aplikasi" : actionLabel),
            ["full_action_url"] = WebUtility.HtmlEncode(fullActionUrl),
            ["dev_redirect_notice"] = devNotice,
            ["timestamp_wib"] = WebUtility.HtmlEncode(wibTime),
            ["body_content"] = renderedBody
        };

        var finalHtml = RenderScribanString(layoutHtml, layoutVars, "_BaseLayout");
        var plainPreview = BuildPlainPreview(renderedBody);

        return new RenderedEmailResult(renderedSubject, finalHtml, plainPreview);
    }

    public Task<string?> LoadDefaultBodyHtmlAsync(string fileName, CancellationToken cancellationToken = default) =>
        LoadTemplateFileAsync(fileName, cancellationToken);

    private async Task<string?> LoadTemplateFileAsync(string fileName, CancellationToken cancellationToken)
    {
        var safeFileName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeFileName))
        {
            return null;
        }

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Infrastructure", "Templating", "EmailTemplates", safeFileName),
            Path.Combine(hostEnvironment.ContentRootPath, "Infrastructure", "Templating", "EmailTemplates", safeFileName)
        };

        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                return await File.ReadAllTextAsync(path, cancellationToken);
            }
        }

        logger.LogWarning("[TemplateRenderer] File template default '{FileName}' tidak ditemukan di disk.", safeFileName);
        return null;
    }

    private string RenderScribanString(string templateSource, ScriptObject scriptObject, string templateLabel)
    {
        if (string.IsNullOrWhiteSpace(templateSource))
        {
            return string.Empty;
        }

        var template = Template.Parse(templateSource);
        if (template.HasErrors)
        {
            logger.LogWarning(
                "[TemplateRenderer] Syntax warning di template {Label}: {Errors}",
                templateLabel,
                string.Join("; ", template.Messages.Select(m => m.Message)));
            return templateSource;
        }

        var context = new TemplateContext
        {
            StrictVariables = false,
            MemberRenamer = member => member.Name
        };
        context.PushGlobal(scriptObject);

        return template.Render(context);
    }

    private string BuildAbsoluteActionUrl(string? actionUrl)
    {
        if (string.IsNullOrWhiteSpace(actionUrl))
        {
            return string.Empty;
        }

        var trimmed = actionUrl.Trim();
        if (trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        var baseUrl = (_emailSettings.AppBaseUrl ?? "http://localhost:5173").TrimEnd('/');
        return trimmed.StartsWith('/') ? $"{baseUrl}{trimmed}" : $"{baseUrl}/{trimmed}";
    }

    private static string SanitizeHexColor(string? color)
    {
        if (!string.IsNullOrWhiteSpace(color) && Regex.IsMatch(color.Trim(), @"^#[0-9A-Fa-f]{6}$"))
        {
            return color.Trim();
        }
        return "#0D9488";
    }

    private static string BuildPlainPreview(string html)
    {
        var text = Regex.Replace(html, "<[^>]+>", " ");
        text = WebUtility.HtmlDecode(text);
        text = Regex.Replace(text, @"\s+", " ").Trim();
        return text.Length <= 240 ? text : text[..240] + "...";
    }
}
