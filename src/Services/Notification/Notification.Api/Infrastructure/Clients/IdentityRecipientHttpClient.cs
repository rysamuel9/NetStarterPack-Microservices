using System.Net.Http.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Messaging;
using BuildingBlocks.Security;
using Microsoft.Extensions.Options;
using Notification.Api.Application.Interfaces;

namespace Notification.Api.Infrastructure.Clients;

/// <summary>
/// HTTP Client resilient (Polly v8) dari Notification.Api ke Identity.Api untuk me-resolve daftar penerima
/// (Email, FullName, Role) berdasarkan UserIds dan/atau RoleNames.
/// </summary>
public class IdentityRecipientHttpClient(
    HttpClient httpClient,
    IOptions<ServiceEndpointsSettings> endpointsOptions,
    IOptions<JwtSettings> jwtOptions,
    ICurrentUserService currentUserService,
    ILogger<IdentityRecipientHttpClient> logger) : IIdentityRecipientClient
{
    private readonly ServiceEndpointsSettings _endpoints = endpointsOptions.Value;
    private readonly JwtSettings _jwtSettings = jwtOptions.Value;

    public async Task<IReadOnlyList<ResolvedRecipientDto>> ResolveRecipientsAsync(
        ResolveRecipientsRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"{_endpoints.IdentityServiceUrl.TrimEnd('/')}/api/internal/users/resolve-recipients";
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = JsonContent.Create(request)
            };

            httpRequest.Headers.Add("X-Internal-Api-Key", _jwtSettings.InternalApiKey);
            httpRequest.Headers.Add(CurrentUserService.CorrelationHeaderName, currentUserService.CorrelationId);

            var response = await httpClient.SendAsync(httpRequest, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "[Notification.Api] Identity.Api merespons HTTP {StatusCode} saat resolve recipients.",
                    (int)response.StatusCode);
                return [];
            }

            var result = await response.Content.ReadFromJsonAsync<Result<List<ResolvedRecipientDto>>>(cancellationToken: cancellationToken);
            return result?.Data ?? [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Notification.Api] Gagal menghubungi Identity.Api untuk resolve recipients.");
            return [];
        }
    }
}
