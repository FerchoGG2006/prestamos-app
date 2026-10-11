package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Append-only audit trail row. Never updated or deleted; corrections are new rows. */
@Entity
@Table(name = "audit_log")
public class AuditLogEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private String entityId;

    @Column(name = "action", nullable = false)
    private String action;

    @Column(name = "previous_value")
    private String previousValue;

    @Column(name = "new_value")
    private String newValue;

    @Column(name = "reason")
    private String reason;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public AuditLogEntity() {}

    public AuditLogEntity(String id, String userId, String entityType, String entityId, String action,
                          String previousValue, String newValue, String reason, String createdAt) {
        this.id = id;
        this.userId = userId;
        this.entityType = entityType;
        this.entityId = entityId;
        this.action = action;
        this.previousValue = previousValue;
        this.newValue = newValue;
        this.reason = reason;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getUserId() { return userId; }
    public String getEntityType() { return entityType; }
    public String getEntityId() { return entityId; }
    public String getAction() { return action; }
    public String getPreviousValue() { return previousValue; }
    public String getNewValue() { return newValue; }
    public String getReason() { return reason; }
    public String getCreatedAt() { return createdAt; }
}
