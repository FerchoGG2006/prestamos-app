package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DailySettlementRepository extends JpaRepository<DailySettlementEntity, String> {
    Optional<DailySettlementEntity> findBySessionId(String sessionId);
}
