package com.cartera.infrastructure.persistence.repository;

import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface InstallmentRepository extends JpaRepository<InstallmentEntity, String> {
    List<InstallmentEntity> findByLoanId(String loanId);
    List<InstallmentEntity> findByLoanIdOrderByInstallmentNumberAsc(String loanId);
    List<InstallmentEntity> findByDueDate(String dueDate);
    List<InstallmentEntity> findByDueDateAndStatus(String dueDate, String status);
}
