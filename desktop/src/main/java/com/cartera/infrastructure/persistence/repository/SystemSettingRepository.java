package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SystemSettingRepository extends JpaRepository<SystemSettingEntity, String> {
}
