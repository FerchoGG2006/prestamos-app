package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "collection_session")
public class CollectionSessionEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "route_id", nullable = false)
    private String routeId;

    @Column(name = "collector_id", nullable = false)
    private String collectorId;

    @Column(name = "session_date", nullable = false)
    private String sessionDate;

    @Column(name = "opened_at", nullable = false)
    private String openedAt;

    @Column(name = "closed_at")
    private String closedAt;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "expected_collection", nullable = false)
    private BigDecimal expectedCollection;

    @Column(name = "actual_collection", nullable = false)
    private BigDecimal actualCollection;

    @Column(name = "notes")
    private String notes;

    public CollectionSessionEntity() {}

    public CollectionSessionEntity(String id, String routeId, String collectorId, String sessionDate,
                                   String openedAt, String closedAt, String status, BigDecimal expectedCollection,
                                   BigDecimal actualCollection, String notes) {
        this.id = id;
        this.routeId = routeId;
        this.collectorId = collectorId;
        this.sessionDate = sessionDate;
        this.openedAt = openedAt;
        this.closedAt = closedAt;
        this.status = status;
        this.expectedCollection = expectedCollection;
        this.actualCollection = actualCollection;
        this.notes = notes;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public String getSessionDate() { return sessionDate; }
    public void setSessionDate(String sessionDate) { this.sessionDate = sessionDate; }
    public String getOpenedAt() { return openedAt; }
    public void setOpenedAt(String openedAt) { this.openedAt = openedAt; }
    public String getClosedAt() { return closedAt; }
    public void setClosedAt(String closedAt) { this.closedAt = closedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public BigDecimal getExpectedCollection() { return expectedCollection; }
    public void setExpectedCollection(BigDecimal expectedCollection) { this.expectedCollection = expectedCollection; }
    public BigDecimal getActualCollection() { return actualCollection; }
    public void setActualCollection(BigDecimal actualCollection) { this.actualCollection = actualCollection; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
