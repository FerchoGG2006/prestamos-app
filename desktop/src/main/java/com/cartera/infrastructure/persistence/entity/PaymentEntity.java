package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "payment")
public class PaymentEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "idempotency_key", nullable = false, unique = true)
    private String idempotencyKey;

    @Column(name = "loan_id", nullable = false)
    private String loanId;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "collector_id", nullable = false)
    private String collectorId;

    @Column(name = "session_id")
    private String sessionId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "method", nullable = false)
    private String method;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    @Column(name = "annulment_reason")
    private String annulmentReason;

    public PaymentEntity() {}

    public PaymentEntity(String id, String idempotencyKey, String loanId, String customerId, String collectorId,
                         String sessionId, BigDecimal amount, String method, String status, String createdAt,
                         String annulmentReason) {
        this.id = id;
        this.idempotencyKey = idempotencyKey;
        this.loanId = loanId;
        this.customerId = customerId;
        this.collectorId = collectorId;
        this.sessionId = sessionId;
        this.amount = amount;
        this.method = method;
        this.status = status;
        this.createdAt = createdAt;
        this.annulmentReason = annulmentReason;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public String getLoanId() { return loanId; }
    public void setLoanId(String loanId) { this.loanId = loanId; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getPaymentMethod() { return method; }
    public void setPaymentMethod(String paymentMethod) { this.method = paymentMethod; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getAnnulmentReason() { return annulmentReason; }
    public void setAnnulmentReason(String annulmentReason) { this.annulmentReason = annulmentReason; }
}
