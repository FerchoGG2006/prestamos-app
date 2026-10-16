package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, String> {
    List<AuditLogEntity> findByEntityTypeAndEntityId(String entityType, String entityId);
}
