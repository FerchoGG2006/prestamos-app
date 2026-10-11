package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface InstallmentRepository extends JpaRepository<InstallmentEntity, String> {
    List<InstallmentEntity> findByLoanIdOrderByInstallmentNumberAsc(String loanId);
    List<InstallmentEntity> findByDueDate(String dueDate);
    List<InstallmentEntity> findByDueDateAndStatus(String dueDate, String status);
}
