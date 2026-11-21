package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.FinancialEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FinancialEventRepository extends JpaRepository<FinancialEventEntity, Integer> {
    Optional<FinancialEventEntity> findByOfficeIdAndIdempotencyKey(String officeId, String idempotencyKey);
    List<FinancialEventEntity> findByOfficeIdOrderBySequenceNoAsc(String officeId);
    List<FinancialEventEntity> findByOfficeIdAndRouteIdOrderBySequenceNoAsc(String officeId, String routeId);
}
