package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.RouteEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RouteRepository extends JpaRepository<RouteEntity, String> {
}
