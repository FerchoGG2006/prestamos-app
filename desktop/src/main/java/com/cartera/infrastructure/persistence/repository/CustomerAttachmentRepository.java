package com.cartera.infrastructure.persistence.repository;
import com.cartera.infrastructure.persistence.entity.CustomerAttachmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CustomerAttachmentRepository extends JpaRepository<CustomerAttachmentEntity,String> {
 java.util.List<CustomerAttachmentEntity> findByCustomerIdOrderByCreatedAtDesc(String customerId);
}
