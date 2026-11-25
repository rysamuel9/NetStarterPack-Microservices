using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BuildingBlocks.Security;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Identity.Api.Infrastructure.Security;

public class JwtTokenService(IOptions<JwtSettings> jwtOptions) : IJwtTokenService
{
    private readonly JwtSettings _settings = jwtOptions.Value;

    public (string AccessToken, DateTime ExpiresAt) GenerateAccessToken(
        User user,
        IEnumerable<string> roles,
        IEnumerable<string> permissions)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(_settings.AccessTokenExpirationMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new("fullName", user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        foreach (var role in roles.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        foreach (var permission in permissions.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            claims.Add(new Claim("permission", permission));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.SecretKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var tokenDescriptor = new JwtSecurityToken(
            issuer: _settings.Issuer,
            audience: _settings.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);
        return (tokenString, expiresAt);
    }

    public string GenerateRefreshToken()
    {
        var randomBytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(randomBytes);
    }

    public int GetRefreshTokenExpiryDays() => _settings.RefreshTokenExpirationDays;
}

public class PasswordHasher : IPasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int LegacyIterations = 100_000;
    private const int CurrentIterations = 600_000; // Rekomendasi OWASP untuk PBKDF2-HMAC-SHA256
    private static readonly HashAlgorithmName Algorithm = HashAlgorithmName.SHA256;

    public string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, CurrentIterations, Algorithm, KeySize);
        return $"v2.{CurrentIterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string passwordHash)
    {
        if (string.IsNullOrWhiteSpace(passwordHash))
        {
            return false;
        }

        var parts = passwordHash.Split('.');
        try
        {
            if (parts.Length == 4 && parts[0] == "v2" && int.TryParse(parts[1], out var iterations) && iterations >= 100_000)
            {
                var salt = Convert.FromBase64String(parts[2]);
                var expectedHash = Convert.FromBase64String(parts[3]);
                var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, Algorithm, expectedHash.Length);
                return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
            }

            // Kompatibilitas backward untuk hash v1 (100_000 iterasi) yang sudah tersimpan sebelumnya
            if (parts.Length == 2)
            {
                var salt = Convert.FromBase64String(parts[0]);
                var expectedHash = Convert.FromBase64String(parts[1]);
                var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, LegacyIterations, Algorithm, KeySize);
                return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
            }

            return false;
        }
        catch
        {
            return false;
        }
    }
}
