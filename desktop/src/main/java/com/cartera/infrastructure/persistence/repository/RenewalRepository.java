package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.RenewalEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RenewalRepository extends JpaRepository<RenewalEntity, String> {
}
