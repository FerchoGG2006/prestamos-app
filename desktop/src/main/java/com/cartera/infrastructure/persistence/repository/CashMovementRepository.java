package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface CashMovementRepository extends JpaRepository<CashMovementEntity, String> {
    List<CashMovementEntity> findByCreatedAtStartingWith(String datePrefix);
}
