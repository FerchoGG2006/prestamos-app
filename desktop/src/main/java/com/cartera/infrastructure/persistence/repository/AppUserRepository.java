package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface AppUserRepository extends JpaRepository<AppUserEntity, String> {
    Optional<AppUserEntity> findByUsername(String username);
}
