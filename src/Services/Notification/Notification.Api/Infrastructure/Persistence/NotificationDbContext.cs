using Microsoft.EntityFrameworkCore;
using Notification.Api.Domain.Entities;

namespace Notification.Api.Infrastructure.Persistence;

public class NotificationDbContext(DbContextOptions<NotificationDbContext> options) : DbContext(options)
{
    public DbSet<NotificationItem> Notifications => Set<NotificationItem>();
    public DbSet<NotificationTemplate> Templates => Set<NotificationTemplate>();
    public DbSet<NotificationPreference> Preferences => Set<NotificationPreference>();
    public DbSet<UserPushDevice> PushDevices => Set<UserPushDevice>();
    public DbSet<NotificationDeliveryLog> DeliveryLogs => Set<NotificationDeliveryLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<NotificationItem>(entity =>
        {
            entity.ToTable("Notifications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Category).HasMaxLength(50).IsRequired();
            entity.Property(e => e.TemplateCode).HasMaxLength(80).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Message).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.Severity).HasMaxLength(20).IsRequired();
            entity.Property(e => e.ActionUrl).HasMaxLength(500);
            entity.Property(e => e.EntityId).HasMaxLength(120);
            entity.Property(e => e.SourceService).HasMaxLength(80).IsRequired();
            entity.HasIndex(e => new { e.UserId, e.IsRead, e.CreatedAt });
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<NotificationTemplate>(entity =>
        {
            entity.ToTable("NotificationTemplates");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Code).HasMaxLength(80).IsRequired();
            entity.Property(e => e.Name).HasMaxLength(150).IsRequired();
            entity.Property(e => e.Category).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.SubjectTemplate).HasMaxLength(300).IsRequired();
            entity.Property(e => e.AccentColor).HasMaxLength(20).IsRequired();
            entity.Property(e => e.ActionLabel).HasMaxLength(80).IsRequired();
            entity.Property(e => e.DefaultFileName).HasMaxLength(120).IsRequired();
            entity.HasIndex(e => e.Code).IsUnique();
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<NotificationPreference>(entity =>
        {
            entity.ToTable("NotificationPreferences");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Category).HasMaxLength(50).IsRequired();
            entity.HasIndex(e => new { e.UserId, e.Category }).IsUnique();
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<UserPushDevice>(entity =>
        {
            entity.ToTable("UserPushDevices");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Username).HasMaxLength(100).IsRequired();
            entity.Property(e => e.PushToken).HasMaxLength(300).IsRequired();
            entity.Property(e => e.Platform).HasMaxLength(30).IsRequired();
            entity.Property(e => e.DeviceName).HasMaxLength(150).IsRequired();
            entity.HasIndex(e => new { e.UserId, e.PushToken }).IsUnique();
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<NotificationDeliveryLog>(entity =>
        {
            entity.ToTable("NotificationDeliveryLogs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RecipientName).HasMaxLength(150);
            entity.Property(e => e.RecipientEmail).HasMaxLength(200);
            entity.Property(e => e.EffectiveRecipientEmail).HasMaxLength(200);
            entity.Property(e => e.RecipientPushToken).HasMaxLength(300);
            entity.Property(e => e.TemplateCode).HasMaxLength(80).IsRequired();
            entity.Property(e => e.Category).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Subject).HasMaxLength(300).IsRequired();
            entity.Property(e => e.BodyPreview).HasMaxLength(500);
            entity.Property(e => e.ActionUrl).HasMaxLength(500);
            entity.Property(e => e.ProviderName).HasMaxLength(80);
            entity.Property(e => e.LastError).HasMaxLength(1000);
            entity.HasIndex(e => new { e.Status, e.NextRetryAt });
            entity.HasQueryFilter(e => !e.IsDeleted);
        });
    }
}
