namespace BuildingBlocks.Core.Attributes;

/// <summary>
/// Menandai endpoint (Controller atau Action) agar dilindungi oleh IdempotencyMiddleware
/// menggunakan header HTTP <c>Idempotency-Key</c> dan Hybrid Cache L1/L2.
/// Cocok untuk mencegah double-submit (klik Submit/Approve 2x saat koneksi lambat atau retry jaringan).
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false, Inherited = true)]
public sealed class IdempotentAttribute : Attribute
{
    /// <summary>
    /// Jika <c>true</c>, request tanpa header <c>Idempotency-Key</c> akan langsung ditolak (HTTP 400).
    /// Default <c>false</c>: backward-compatible dengan client lama/Swagger, dan otomatis aktif begitu header dikirim.
    /// </summary>
    public bool RequireKey { get; set; }

    /// <summary>
    /// Masa simpan hasil response idempotent dalam menit.
    /// Nilai <c>0</c> (default) berarti mengikuti <c>IdempotencySettings:DefaultExpirationMinutes</c>.
    /// </summary>
    public int ExpirationMinutes { get; set; }
}

/// <summary>
/// Standar nama header HTTP yang digunakan untuk fitur Idempotency lintas Gateway &amp; Microservice.
/// </summary>
public static class IdempotencyHeaders
{
    public const string Key = "Idempotency-Key";
    public const string Replayed = "X-Idempotent-Replayed";
}
