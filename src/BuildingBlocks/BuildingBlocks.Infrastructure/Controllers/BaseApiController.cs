using BuildingBlocks.Core.Common;
using Microsoft.AspNetCore.Mvc;

namespace BuildingBlocks.Infrastructure.Controllers;

[ApiController]
[Route("api/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    protected IActionResult ToActionResult(Result result) =>
        StatusCode(result.StatusCode, result);

    protected IActionResult ToActionResult<T>(Result<T> result) =>
        StatusCode(result.StatusCode, result);
}
