package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.CollectionSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CollectionSessionRepository extends JpaRepository<CollectionSessionEntity, String> {
    Optional<CollectionSessionEntity> findByRouteIdAndSessionDate(String routeId, String sessionDate);
}
