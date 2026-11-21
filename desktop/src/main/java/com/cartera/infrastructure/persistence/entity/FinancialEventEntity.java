package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Hecho atómico inmutable del Libro Mayor Financiero (patrón Datomic / Nubank append-only).
 * Los triggers de SQLite bloquean cualquier UPDATE o DELETE sobre esta tabla.
 * Todos los montos se almacenan como texto decimal exacto para preservar escala BigDecimal.
 */
@Entity
@Table(name = "financial_event")
public class FinancialEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "sequence_no")
    private Integer sequenceNo;

    @Column(name = "id", nullable = false, unique = true)
    private String id;

    @Column(name = "office_id", nullable = false)
    private String officeId;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private String entityId;

    @Column(name = "route_id")
    private String routeId;

    @Column(name = "customer_id")
    private String customerId;

    @Column(name = "actor_user_id")
    private String actorUserId;

    @Column(name = "amount", nullable = false)
    private String amount;

    @Column(name = "cash_delta", nullable = false)
    private String cashDelta;

    @Column(name = "digital_delta", nullable = false)
    private String digitalDelta;

    @Column(name = "portfolio_delta", nullable = false)
    private String portfolioDelta;

    @Column(name = "payload_json", nullable = false)
    private String payloadJson;

    @Column(name = "occurred_at", nullable = false)
    private String occurredAt;

    @Column(name = "recorded_at", nullable = false)
    private String recordedAt;

    public FinancialEventEntity() {}

    public FinancialEventEntity(
            String id,
            String officeId,
            String idempotencyKey,
            String eventType,
            String entityType,
            String entityId,
            String routeId,
            String customerId,
            String actorUserId,
            String amount,
            String cashDelta,
            String digitalDelta,
            String portfolioDelta,
            String payloadJson,
            String occurredAt,
            String recordedAt
    ) {
        this.id = id;
        this.officeId = officeId;
        this.idempotencyKey = idempotencyKey;
        this.eventType = eventType;
        this.entityType = entityType;
        this.entityId = entityId;
        this.routeId = routeId;
        this.customerId = customerId;
        this.actorUserId = actorUserId;
        this.amount = amount;
        this.cashDelta = cashDelta;
        this.digitalDelta = digitalDelta;
        this.portfolioDelta = portfolioDelta;
        this.payloadJson = payloadJson;
        this.occurredAt = occurredAt;
        this.recordedAt = recordedAt;
    }

    public Integer getSequenceNo() { return sequenceNo; }
    public String getId() { return id; }
    public String getOfficeId() { return officeId; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getEventType() { return eventType; }
    public String getEntityType() { return entityType; }
    public String getEntityId() { return entityId; }
    public String getRouteId() { return routeId; }
    public String getCustomerId() { return customerId; }
    public String getActorUserId() { return actorUserId; }
    public String getAmount() { return amount; }
    public String getCashDelta() { return cashDelta; }
    public String getDigitalDelta() { return digitalDelta; }
    public String getPortfolioDelta() { return portfolioDelta; }
    public String getPayloadJson() { return payloadJson; }
    public String getOccurredAt() { return occurredAt; }
    public String getRecordedAt() { return recordedAt; }
}
