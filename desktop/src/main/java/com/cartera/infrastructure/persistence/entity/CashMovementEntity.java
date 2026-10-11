package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "cash_movement")
public class CashMovementEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "route_id")
    private String routeId;

    @Column(name = "collector_id")
    private String collectorId;

    @Column(name = "session_id")
    private String sessionId;

    @Column(name = "movement_type", nullable = false)
    private String movementType;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "reference_id")
    private String referenceId;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public CashMovementEntity() {}

    public CashMovementEntity(String id, String routeId, String collectorId, String sessionId,
                              String movementType, String category, BigDecimal amount, String referenceId,
                              String description, String createdAt) {
        this.id = id;
        this.routeId = routeId;
        this.collectorId = collectorId;
        this.sessionId = sessionId;
        this.movementType = movementType;
        this.category = category;
        this.amount = amount;
        this.referenceId = referenceId;
        this.description = description;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getMovementType() { return movementType; }
    public void setMovementType(String movementType) { this.movementType = movementType; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getReferenceId() { return referenceId; }
    public void setReferenceId(String referenceId) { this.referenceId = referenceId; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
