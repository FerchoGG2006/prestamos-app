package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PaymentPromiseRepository extends JpaRepository<PaymentPromiseEntity, String> {
    List<PaymentPromiseEntity> findByLoanId(String loanId);
    List<PaymentPromiseEntity> findByCustomerId(String customerId);
}
