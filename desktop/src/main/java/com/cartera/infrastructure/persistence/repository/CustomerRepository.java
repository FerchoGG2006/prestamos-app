package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository extends JpaRepository<CustomerEntity, String> {
    Optional<CustomerEntity> findByDocumentNumber(String documentNumber);
    List<CustomerEntity> findByRouteId(String routeId);
    List<CustomerEntity> findByFullNameContainingIgnoreCaseOrDocumentNumberContaining(String name, String doc);
}
