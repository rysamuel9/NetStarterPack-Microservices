using Identity.Api.Infrastructure.Security;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class PasswordHasherTests
{
    [Fact]
    public void HashPassword_ShouldGenerateUniqueSaltedHash_AndVerifyCorrectly()
    {
        var hasher = new PasswordHasher();

        var hash1 = hasher.HashPassword("Password123!");
        var hash2 = hasher.HashPassword("Password123!");

        Assert.NotEqual(hash1, hash2);
        Assert.True(hasher.VerifyPassword("Password123!", hash1));
        Assert.True(hasher.VerifyPassword("Password123!", hash2));
        Assert.False(hasher.VerifyPassword("WrongPassword!", hash1));
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid-format-without-dot")]
    [InlineData("not-base64.not-base64")]
    public void VerifyPassword_WithMalformedHash_ShouldReturnFalse(string malformedHash)
    {
        var hasher = new PasswordHasher();

        Assert.False(hasher.VerifyPassword("Password123!", malformedHash));
    }
}
