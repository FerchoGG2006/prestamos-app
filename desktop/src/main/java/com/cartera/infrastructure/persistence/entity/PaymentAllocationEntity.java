package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "payment_allocation")
public class PaymentAllocationEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "payment_id", nullable = false)
    private String paymentId;

    @Column(name = "installment_id", nullable = false)
    private String installmentId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    public PaymentAllocationEntity() {}

    public PaymentAllocationEntity(String id, String paymentId, String installmentId, BigDecimal amount) {
        this.id = id;
        this.paymentId = paymentId;
        this.installmentId = installmentId;
        this.amount = amount;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getPaymentId() { return paymentId; }
    public void setPaymentId(String paymentId) { this.paymentId = paymentId; }
    public String getInstallmentId() { return installmentId; }
    public void setInstallmentId(String installmentId) { this.installmentId = installmentId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
}
