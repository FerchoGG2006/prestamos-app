package com.cartera.customers.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Objects;
import java.util.UUID;

@Service
public class CreateCustomerUseCase {

    private final CustomerRepository customerRepository;
    private final AuditLogRepository auditLogRepository;

    public CreateCustomerUseCase(CustomerRepository customerRepository, AuditLogRepository auditLogRepository) {
        this.customerRepository = customerRepository;
        this.auditLogRepository = auditLogRepository;
    }

    public record CreateCustomerCommand(
            String fullName,
            String documentNumber,
            String phone,
            String altPhone,
            String address,
            String neighborhood,
            String city,
            String occupation,
            String businessName,
            String notes,
            String routeId,
            String collectorId,
            String authorUserId
    ) {}

    @Transactional
    public CustomerEntity execute(CreateCustomerCommand cmd) {
        Objects.requireNonNull(cmd, "El comando no puede ser nulo");

        if (cmd.fullName() == null || cmd.fullName().trim().isEmpty()) {
            throw new IllegalArgumentException("El nombre completo del cliente es obligatorio.");
        }
        if (cmd.documentNumber() == null || cmd.documentNumber().trim().isEmpty()) {
            throw new IllegalArgumentException("El documento / cédula es obligatorio.");
        }
        if (cmd.phone() == null || cmd.phone().trim().isEmpty()) {
            throw new IllegalArgumentException("El número de teléfono es obligatorio.");
        }

        String docTrimmed = cmd.documentNumber().trim();
        if (customerRepository.findByDocumentNumber(docTrimmed).isPresent()) {
            throw new IllegalArgumentException("Ya existe un cliente registrado con el documento " + docTrimmed);
        }

        String id = UUID.randomUUID().toString();
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        CustomerEntity customer = new CustomerEntity(
                id,
                cmd.fullName().trim(),
                docTrimmed,
                cmd.phone().trim(),
                cmd.altPhone() != null ? cmd.altPhone().trim() : null,
                cmd.address() != null ? cmd.address().trim() : "",
                cmd.neighborhood() != null ? cmd.neighborhood().trim() : "",
                cmd.city() != null && !cmd.city().isBlank() ? cmd.city().trim() : "Barranquilla",
                cmd.occupation() != null ? cmd.occupation().trim() : "",
                cmd.businessName() != null ? cmd.businessName().trim() : "",
                cmd.notes() != null ? cmd.notes().trim() : "",
                "ACTIVO",
                cmd.routeId() != null ? cmd.routeId() : "route-norte",
                cmd.collectorId() != null ? cmd.collectorId() : "usr-col-1",
                now
        );

        customerRepository.save(customer);

        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                cmd.authorUserId() != null ? cmd.authorUserId() : cmd.collectorId(),
                "CUSTOMER",
                customer.getId(),
                "CREAR_CLIENTE",
                null,
                "Cliente: " + customer.getFullName() + " Doc: " + customer.getDocumentNumber(),
                "Registro de nuevo cliente en plataforma",
                now
        ));

        return customer;
    }
}
