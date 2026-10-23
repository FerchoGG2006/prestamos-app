package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "payment_promise")
public class PaymentPromiseEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "loan_id")
    private String loanId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "promised_date", nullable = false)
    private String promisedDate;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public PaymentPromiseEntity() {}

    public PaymentPromiseEntity(String id, String customerId, String loanId, BigDecimal amount,
                                String promisedDate, String status, String notes, String createdAt) {
        this.id = id;
        this.customerId = customerId;
        this.loanId = loanId;
        this.amount = amount;
        this.promisedDate = promisedDate;
        this.status = status;
        this.notes = notes;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getLoanId() { return loanId; }
    public void setLoanId(String loanId) { this.loanId = loanId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getPromisedAmount() { return amount; }
    public void setPromisedAmount(BigDecimal promisedAmount) { this.amount = promisedAmount; }
    public String getPromisedDate() { return promisedDate; }
    public void setPromisedDate(String promisedDate) { this.promisedDate = promisedDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
