package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "route")
public class RouteEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "collector_id")
    private String collectorId;

    @Column(name = "active", nullable = false)
    private Integer active;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "initial_cash_base", nullable = false)
    private BigDecimal initialCashBase = BigDecimal.ZERO;

    public RouteEntity() {}

    public RouteEntity(String id, String name, String collectorId, Integer active, String createdAt) {
        this.id = id;
        this.name = name;
        this.collectorId = collectorId;
        this.active = active;
        this.createdAt = createdAt;
        this.initialCashBase = BigDecimal.ZERO;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public Integer getActive() { return active; }
    public void setActive(Integer active) { this.active = active; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public BigDecimal getInitialCashBase() { return initialCashBase != null ? initialCashBase : BigDecimal.ZERO; }
    public void setInitialCashBase(BigDecimal initialCashBase) {
        this.initialCashBase = initialCashBase != null ? initialCashBase : BigDecimal.ZERO;
    }
}
