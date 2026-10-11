package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.PaymentAllocationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocationEntity, String> {
    List<PaymentAllocationEntity> findByPaymentId(String paymentId);
    List<PaymentAllocationEntity> findByInstallmentId(String installmentId);
}
