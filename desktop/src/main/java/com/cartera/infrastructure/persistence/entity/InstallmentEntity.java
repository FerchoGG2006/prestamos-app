package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "installment")
public class InstallmentEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "loan_id", nullable = false)
    private String loanId;

    @Column(name = "installment_number", nullable = false)
    private Integer installmentNumber;

    @Column(name = "due_date", nullable = false)
    private String dueDate;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "paid_amount", nullable = false)
    private BigDecimal paidAmount;

    @Column(name = "status", nullable = false)
    private String status;

    public InstallmentEntity() {}

    public InstallmentEntity(String id, String loanId, Integer installmentNumber, String dueDate,
                             BigDecimal amount, BigDecimal paidAmount, String status) {
        this.id = id;
        this.loanId = loanId;
        this.installmentNumber = installmentNumber;
        this.dueDate = dueDate;
        this.amount = amount;
        this.paidAmount = paidAmount;
        this.status = status;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getLoanId() { return loanId; }
    public void setLoanId(String loanId) { this.loanId = loanId; }
    public Integer getInstallmentNumber() { return installmentNumber; }
    public void setInstallmentNumber(Integer installmentNumber) { this.installmentNumber = installmentNumber; }
    public String getDueDate() { return dueDate; }
    public void setDueDate(String dueDate) { this.dueDate = dueDate; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getPendingAmount() {
        return amount.subtract(paidAmount != null ? paidAmount : BigDecimal.ZERO);
    }
}
