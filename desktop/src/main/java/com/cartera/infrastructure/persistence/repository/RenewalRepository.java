package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.RenewalEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RenewalRepository extends JpaRepository<RenewalEntity, String> {
}
