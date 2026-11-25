using System.Security.Claims;
using BuildingBlocks.Core.Interfaces;
using Microsoft.AspNetCore.Http;

namespace BuildingBlocks.Security;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    public const string CorrelationHeaderName = "X-Correlation-Id";
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var idClaim = User?.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? User?.FindFirstValue("sub");
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    public string? Username => User?.FindFirstValue(ClaimTypes.Name);

    public string? FullName => User?.FindFirstValue("fullName") ?? Username;

    public IReadOnlyList<string> Roles =>
        User?.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct().ToList() ?? [];

    public IReadOnlyList<string> Permissions =>
        User?.FindAll("permission").Select(c => c.Value).Distinct().ToList() ?? [];

    // Hanya percaya RemoteIpAddress yang sudah dinormalisasi oleh ASP.NET Core UseForwardedHeaders()
    // agar attacker tidak bisa memalsukan IP lewat header X-Forwarded-For mentah.
    public string? IpAddress =>
        httpContextAccessor.HttpContext?.Connection?.RemoteIpAddress?.ToString();

    public string CorrelationId =>
        httpContextAccessor.HttpContext?.Request.Headers[CorrelationHeaderName].FirstOrDefault()
        ?? httpContextAccessor.HttpContext?.TraceIdentifier
        ?? Guid.NewGuid().ToString("N");
}

