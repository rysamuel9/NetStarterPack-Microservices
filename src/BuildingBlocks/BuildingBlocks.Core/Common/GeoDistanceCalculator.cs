namespace BuildingBlocks.Core.Common;

/// <summary>
/// Utilitas perhitungan geospasial murni C# (tanpa external NuGet) untuk validasi koordinat GPS,
/// perhitungan jarak Haversine (geofencing server-side), dan deteksi anomali kecepatan (Impossible Travel).
/// </summary>
public static class GeoDistanceCalculator
{
    private const double EarthRadiusMeters = 6_371_000.0;

    public static bool IsValidCoordinate(double latitude, double longitude)
    {
        if (double.IsNaN(latitude) || double.IsInfinity(latitude) ||
            double.IsNaN(longitude) || double.IsInfinity(longitude))
        {
            return false;
        }

        if (latitude is < -90.0 or > 90.0 || longitude is < -180.0 or > 180.0)
        {
            return false;
        }

        // Tolak Null Island (0, 0) yang biasanya menandakan GPS gagal lock / payload kosong
        if (Math.Abs(latitude) < 0.00001 && Math.Abs(longitude) < 0.00001)
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// Menghitung jarak permukaan bumi (dalam meter) antara dua titik GPS menggunakan Haversine Formula.
    /// </summary>
    public static double CalculateHaversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = DegreesToRadians(lat2 - lat1);
        var dLon = DegreesToRadians(lon2 - lon1);

        var radLat1 = DegreesToRadians(lat1);
        var radLat2 = DegreesToRadians(lat2);

        var sinHalfLat = Math.Sin(dLat / 2.0);
        var sinHalfLon = Math.Sin(dLon / 2.0);

        var a = sinHalfLat * sinHalfLat +
                Math.Cos(radLat1) * Math.Cos(radLat2) * sinHalfLon * sinHalfLon;

        var c = 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0.0, 1.0 - a)));
        return Math.Round(EarthRadiusMeters * c, 2);
    }

    /// <summary>
    /// Menghitung kecepatan rata-rata perpindahan dalam km/jam untuk mendeteksi Impossible Travel / Fake GPS.
    /// </summary>
    public static double CalculateSpeedKmh(double distanceMeters, double elapsedSeconds)
    {
        if (elapsedSeconds <= 0.1 || distanceMeters <= 0)
        {
            return 0;
        }

        return Math.Round((distanceMeters / elapsedSeconds) * 3.6, 2);
    }

    private static double DegreesToRadians(double degrees) => degrees * (Math.PI / 180.0);
}
