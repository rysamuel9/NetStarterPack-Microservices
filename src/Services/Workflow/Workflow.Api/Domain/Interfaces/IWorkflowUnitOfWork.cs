using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using Workflow.Api.Domain.Entities;

namespace Workflow.Api.Domain.Interfaces;

public interface IWorkflowRequestRepository : IRepository<WorkflowRequest>
{
    Task<List<WorkflowRequest>> GetAllWithDetailsAsync(CancellationToken cancellationToken = default);
    Task<WorkflowRequest?> GetWithDetailsByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<List<WorkflowRequest>> GetPendingForRolesAsync(IEnumerable<string> roles, bool isSuperAdmin, CancellationToken cancellationToken = default);
}

public interface IWorkflowUnitOfWork
{
    IRepository<FormTemplate> Templates { get; }
    IWorkflowRequestRepository Requests { get; }
    IRepository<T> Repository<T>() where T : BaseEntity;
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
