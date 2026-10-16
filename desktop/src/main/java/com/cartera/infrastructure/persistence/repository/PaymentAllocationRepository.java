package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.PaymentAllocationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocationEntity, String> {
    List<PaymentAllocationEntity> findByPaymentId(String paymentId);
    List<PaymentAllocationEntity> findByInstallmentId(String installmentId);
}
