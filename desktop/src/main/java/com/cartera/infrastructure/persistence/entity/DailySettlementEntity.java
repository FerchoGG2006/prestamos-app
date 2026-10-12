package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * Registro inmutable de liquidación y cierre diario de ruta.
 * Regla AGENTS.md: Los cierres liquidados son inmutables; no se eliminan ni editan en silencio.
 */
@Entity
@Table(name = "daily_settlement")
public class DailySettlementEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "session_id", nullable = false, unique = true)
    private String sessionId;

    @Column(name = "expected_collection", nullable = false)
    private BigDecimal expectedCollection;

    @Column(name = "actual_collection", nullable = false)
    private BigDecimal actualCollection;

    @Column(name = "cash_difference", nullable = false)
    private BigDecimal cashDifference;

    @Column(name = "difference_justification")
    private String differenceJustification;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "settled_at", nullable = false)
    private String settledAt;

    public DailySettlementEntity() {}

    public DailySettlementEntity(String id, String sessionId, BigDecimal expectedCollection,
                                 BigDecimal actualCollection, BigDecimal cashDifference,
                                 String differenceJustification, String status, String settledAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.expectedCollection = expectedCollection;
        this.actualCollection = actualCollection;
        this.cashDifference = cashDifference;
        this.differenceJustification = differenceJustification;
        this.status = status;
        this.settledAt = settledAt;
    }

    public String getId() { return id; }
    public String getSessionId() { return sessionId; }
    public BigDecimal getExpectedCollection() { return expectedCollection; }
    public BigDecimal getActualCollection() { return actualCollection; }
    public BigDecimal getCashDifference() { return cashDifference; }
    public String getDifferenceJustification() { return differenceJustification; }
    public String getStatus() { return status; }
    public String getSettledAt() { return settledAt; }
}
