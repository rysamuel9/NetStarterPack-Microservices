using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Catalog.Api.Controllers;

[Authorize]
public class ProductsController(IProductService productService) : BaseApiController
{
    /// <summary>
    /// Mengambil daftar produk dari Catalog Microservice (NetStarterPack_CatalogDb) dengan Cache-Aside.
    /// </summary>
    [HasPermission(Permissions.Products.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? category,
        CancellationToken cancellationToken) =>
        ToActionResult(await productService.GetAllProductsAsync(search, category, cancellationToken));

    /// <summary>
    /// Mengambil ringkasan statistik produk untuk agregasi Dashboard lintas microservice.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken) =>
        ToActionResult(await productService.GetCatalogStatsAsync(cancellationToken));

    /// <summary>
    /// Mengambil detail produk berdasarkan ID.
    /// </summary>
    [HasPermission(Permissions.Products.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await productService.GetProductByIdAsync(id, cancellationToken));

    /// <summary>
    /// Menambahkan produk baru ke Catalog Microservice dan mem-publish AuditLogIntegrationEvent ke Identity.Api.
    /// </summary>
    [HasPermission(Permissions.Products.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateOrUpdateProductRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await productService.CreateProductAsync(request, cancellationToken));

    /// <summary>
    /// Memperbarui produk di Catalog Microservice dan mem-publish AuditLogIntegrationEvent ke Identity.Api.
    /// </summary>
    [HasPermission(Permissions.Products.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrUpdateProductRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await productService.UpdateProductAsync(id, request, cancellationToken));

    /// <summary>
    /// Menghapus produk (soft-delete) di Catalog Microservice dan mem-publish AuditLogIntegrationEvent ke Identity.Api.
    /// </summary>
    [HasPermission(Permissions.Products.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await productService.DeleteProductAsync(id, cancellationToken));
}
