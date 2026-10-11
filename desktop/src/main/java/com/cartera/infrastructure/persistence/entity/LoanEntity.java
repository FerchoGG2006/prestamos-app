package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "loan")
public class LoanEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "route_id")
    private String routeId;

    @Column(name = "collector_id")
    private String collectorId;

    @Column(name = "previous_loan_id")
    private String previousLoanId;

    @Column(name = "operation_type", nullable = false)
    private String operationType;

    @Column(name = "principal", nullable = false)
    private BigDecimal principal;

    @Column(name = "interest_rate", nullable = false)
    private BigDecimal interestRate;

    @Column(name = "interest_amount", nullable = false)
    private BigDecimal interestAmount;

    @Column(name = "total_agreed", nullable = false)
    private BigDecimal totalAgreed;

    @Column(name = "installment_count", nullable = false)
    private Integer installmentCount;

    @Column(name = "frequency", nullable = false)
    private String frequency;

    @Column(name = "start_date", nullable = false)
    private String startDate;

    @Column(name = "end_date")
    private String endDate;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public LoanEntity() {}

    public LoanEntity(String id, String customerId, String routeId, String collectorId, String previousLoanId,
                      String operationType, BigDecimal principal, BigDecimal interestRate, BigDecimal interestAmount,
                      BigDecimal totalAgreed, Integer installmentCount, String frequency, String startDate,
                      String endDate, String status, String createdAt) {
        this.id = id;
        this.customerId = customerId;
        this.routeId = routeId;
        this.collectorId = collectorId;
        this.previousLoanId = previousLoanId;
        this.operationType = operationType;
        this.principal = principal;
        this.interestRate = interestRate;
        this.interestAmount = interestAmount;
        this.totalAgreed = totalAgreed;
        this.installmentCount = installmentCount;
        this.frequency = frequency;
        this.startDate = startDate;
        this.endDate = endDate;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public String getPreviousLoanId() { return previousLoanId; }
    public void setPreviousLoanId(String previousLoanId) { this.previousLoanId = previousLoanId; }
    public String getOperationType() { return operationType; }
    public void setOperationType(String operationType) { this.operationType = operationType; }
    public BigDecimal getPrincipal() { return principal; }
    public void setPrincipal(BigDecimal principal) { this.principal = principal; }
    public BigDecimal getInterestRate() { return interestRate; }
    public void setInterestRate(BigDecimal interestRate) { this.interestRate = interestRate; }
    public BigDecimal getInterestAmount() { return interestAmount; }
    public void setInterestAmount(BigDecimal interestAmount) { this.interestAmount = interestAmount; }
    public BigDecimal getTotalAgreed() { return totalAgreed; }
    public void setTotalAgreed(BigDecimal totalAgreed) { this.totalAgreed = totalAgreed; }
    public Integer getInstallmentCount() { return installmentCount; }
    public void setInstallmentCount(Integer installmentCount) { this.installmentCount = installmentCount; }
    public String getFrequency() { return frequency; }
    public void setFrequency(String frequency) { this.frequency = frequency; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
