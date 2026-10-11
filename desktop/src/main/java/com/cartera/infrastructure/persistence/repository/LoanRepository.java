package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.LoanEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface LoanRepository extends JpaRepository<LoanEntity, String> {
    List<LoanEntity> findByCustomerId(String customerId);
    List<LoanEntity> findByRouteIdAndStatus(String routeId, String status);
    List<LoanEntity> findByStatus(String status);
    Optional<LoanEntity> findFirstByCustomerIdAndStatus(String customerId, String status);
}
