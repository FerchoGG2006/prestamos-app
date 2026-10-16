package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {
    Optional<PaymentEntity> findByIdempotencyKey(String idempotencyKey);
    List<PaymentEntity> findByLoanId(String loanId);
    List<PaymentEntity> findByCreatedAtStartingWith(String datePrefix);
}
