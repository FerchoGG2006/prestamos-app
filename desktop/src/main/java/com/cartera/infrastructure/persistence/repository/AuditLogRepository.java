package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntity, String> {
    List<AuditLogEntity> findByEntityTypeAndEntityId(String entityType, String entityId);
}
