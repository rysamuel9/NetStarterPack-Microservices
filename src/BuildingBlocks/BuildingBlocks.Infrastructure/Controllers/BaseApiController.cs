using Asp.Versioning;
using BuildingBlocks.Core.Common;
using Microsoft.AspNetCore.Mvc;

namespace BuildingBlocks.Infrastructure.Controllers;

/// <summary>
/// Base controller standar untuk seluruh microservice:
/// mendukung URL versioning kanonis <c>/api/v1/[controller]</c> sekaligus mempertahankan alias backward-compatible <c>/api/[controller]</c>.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/[controller]")]
[Route("api/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    protected IActionResult ToActionResult(Result result) =>
        StatusCode(result.StatusCode, result);

    protected IActionResult ToActionResult<T>(Result<T> result) =>
        StatusCode(result.StatusCode, result);
}
