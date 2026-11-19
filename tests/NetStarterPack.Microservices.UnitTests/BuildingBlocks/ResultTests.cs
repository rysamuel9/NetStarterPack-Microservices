using BuildingBlocks.Core.Common;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class ResultTests
{
    [Fact]
    public void Success_ShouldSetSucceededTrueAndStatusCode200ByDefault()
    {
        var result = Result.Success("OK");

        Assert.True(result.Succeeded);
        Assert.Equal("OK", result.Message);
        Assert.Equal(200, result.StatusCode);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void Failure_WithoutExplicitErrors_ShouldFallbackToMessageAsSingleError()
    {
        var result = Result.Failure("Data tidak ditemukan.", 404);

        Assert.False(result.Succeeded);
        Assert.Equal(404, result.StatusCode);
        Assert.Single(result.Errors);
        Assert.Equal("Data tidak ditemukan.", result.Errors[0]);
    }

    [Fact]
    public void GenericResult_Failure_WithExplicitErrors_ShouldPreserveErrorsList()
    {
        var result = Result<string>.Failure("Validasi gagal.", 400, "Field A wajib", "Field B tidak valid");

        Assert.False(result.Succeeded);
        Assert.Null(result.Data);
        Assert.Equal(400, result.StatusCode);
        Assert.Equal(2, result.Errors.Length);
    }

    [Fact]
    public void PagedResult_ShouldCalculateTotalPagesAndNavigationFlags()
    {
        var page1 = new PagedResult<int>
        {
            Items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            PageNumber = 1,
            PageSize = 10,
            TotalCount = 12
        };

        var page2 = new PagedResult<int>
        {
            Items = [11, 12],
            PageNumber = 2,
            PageSize = 10,
            TotalCount = 12
        };

        Assert.Equal(2, page1.TotalPages);
        Assert.False(page1.HasPreviousPage);
        Assert.True(page1.HasNextPage);

        Assert.Equal(2, page2.TotalPages);
        Assert.True(page2.HasPreviousPage);
        Assert.False(page2.HasNextPage);
    }
}
