package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * Entidad inmutable que audita la renovación y reestructuración de créditos.
 */
@Entity
@Table(name = "renewal")
public class RenewalEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "previous_loan_id", nullable = false)
    private String previousLoanId;

    @Column(name = "new_loan_id", nullable = false)
    private String newLoanId;

    @Column(name = "new_principal", nullable = false)
    private BigDecimal newPrincipal;

    @Column(name = "previous_balance_deducted", nullable = false)
    private BigDecimal previousBalanceDeducted;

    @Column(name = "paperwork_deducted", nullable = false)
    private BigDecimal paperworkDeducted;

    @Column(name = "actual_cash_disbursed", nullable = false)
    private BigDecimal actualCashDisbursed;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public RenewalEntity() {}

    public RenewalEntity(String id, String previousLoanId, String newLoanId, BigDecimal newPrincipal,
                         BigDecimal previousBalanceDeducted, BigDecimal paperworkDeducted,
                         BigDecimal actualCashDisbursed, String createdAt) {
        this.id = id;
        this.previousLoanId = previousLoanId;
        this.newLoanId = newLoanId;
        this.newPrincipal = newPrincipal;
        this.previousBalanceDeducted = previousBalanceDeducted;
        this.paperworkDeducted = paperworkDeducted;
        this.actualCashDisbursed = actualCashDisbursed;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getPreviousLoanId() { return previousLoanId; }
    public String getNewLoanId() { return newLoanId; }
    public BigDecimal getNewPrincipal() { return newPrincipal; }
    public BigDecimal getPreviousBalanceDeducted() { return previousBalanceDeducted; }
    public BigDecimal getPaperworkDeducted() { return paperworkDeducted; }
    public BigDecimal getActualCashDisbursed() { return actualCashDisbursed; }
    public String getCreatedAt() { return createdAt; }
}
