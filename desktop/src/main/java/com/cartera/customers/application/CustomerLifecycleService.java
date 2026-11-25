package com.cartera.customers.application;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.FinancialAccess;
import com.cartera.loans.application.CancelLoanUseCase;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;

/** All profile/lifecycle writes share the same authorized transactional boundary. */
@Service
public class CustomerLifecycleService {
    private final CustomerRepository customers;
    private final LoanRepository loans;
    private final RouteRepository routes;
    private final AuditLogRepository audit;
    private final CancelLoanUseCase cancel;
    private final FinancialAccess access;
    public CustomerLifecycleService(CustomerRepository customers, LoanRepository loans, RouteRepository routes,
            AuditLogRepository audit, CancelLoanUseCase cancel, FinancialAccess access) {
        this.customers=customers; this.loans=loans; this.routes=routes; this.audit=audit; this.cancel=cancel; this.access=access;
    }
    @Transactional
    public CustomerEntity deactivate(String customerId, String reason) {
        var actor=access.manager();
        if (reason==null || reason.isBlank()) throw new IllegalArgumentException("El motivo de baja es obligatorio.");
        var customer=customers.findById(customerId).orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado."));
        if ("INACTIVO".equals(customer.getStatus())) return customer;
        for (var loan:loans.findByCustomerId(customerId)) {
            if ("ACTIVO".equalsIgnoreCase(loan.getStatus()) || "ACTIVE".equalsIgnoreCase(loan.getStatus()))
                cancel.execute(loan.getId(), reason.trim()); // Any rejection rolls back every preceding cancellation.
        }
        String before=customer.getStatus(); customer.setStatus("INACTIVO"); customers.save(customer);
        audit.save(new AuditLogEntity(UUID.randomUUID().toString(),actor.userId(),"CUSTOMER",customerId,
            "INACTIVAR_CLIENTE",before,"INACTIVO",reason.trim(),LocalDateTime.now().toString()));
        return customer;
    }
    @Transactional
    public CustomerEntity reactivate(String customerId, String reason) {
        var actor=access.manager();
        if (reason==null || reason.isBlank()) throw new IllegalArgumentException("El motivo de reactivación es obligatorio.");
        var customer=customers.findById(customerId).orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado."));
        if ("ACTIVO".equalsIgnoreCase(customer.getStatus())) return customer;
        String before=customer.getStatus();
        customer.setStatus("ACTIVO");
        customers.save(customer);
        audit.save(new AuditLogEntity(UUID.randomUUID().toString(),actor.userId(),"CUSTOMER",customerId,
            "REACTIVAR_CLIENTE",before,"ACTIVO",reason.trim(),LocalDateTime.now().toString()));
        return customer;
    }
    public record Profile(String customerId, String fullName, String phone, String altPhone, String address, String neighborhood,
                          String city, String businessName, String occupation, String notes, String routeId) {
        public Profile(String customerId, String fullName, String phone, String address, String neighborhood,
                       String businessName, String occupation, String routeId) {
            this(customerId, fullName, phone, null, address, neighborhood, null, businessName, occupation, null, routeId);
        }
    }
    @Transactional
    public CustomerEntity update(Profile command) {
        var customer=customers.findById(command.customerId()).orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado."));
        String ownerCollector = customer.getCollectorId();
        if ((ownerCollector == null || ownerCollector.isBlank()) && customer.getRouteId() != null) {
            ownerCollector = routes.findById(customer.getRouteId()).map(RouteEntity::getCollectorId).orElse(null);
        }
        var actor = (ownerCollector != null && !ownerCollector.isBlank())
                ? access.collector(ownerCollector)
                : access.manager();
        if (command.fullName()==null || command.fullName().isBlank() || command.phone()==null || command.phone().isBlank())
            throw new IllegalArgumentException("Nombre y teléfono son obligatorios.");
        String route=command.routeId()==null ? customer.getRouteId() : command.routeId();
        if (!Objects.equals(route,customer.getRouteId())) {
            access.manager();
            if (!loans.findByCustomerId(customer.getId()).isEmpty())
                throw new IllegalStateException("El cliente tiene contratos. Su traslado requiere una operación auditable específica.");
            var assignment=routes.findById(route).filter(r -> Integer.valueOf(1).equals(r.getActive()))
                .orElseThrow(() -> new IllegalArgumentException("Ruta no disponible."));
            customer.setCollectorId(assignment.getCollectorId());
        }
        String before=describe(customer);
        customer.setFullName(command.fullName().trim()); customer.setPhone(command.phone().trim());
        if (command.altPhone() != null) customer.setAltPhone(command.altPhone().trim());
        customer.setAddress(command.address()); customer.setNeighborhood(command.neighborhood());
        if (command.city() != null) customer.setCity(command.city().trim());
        customer.setBusinessName(command.businessName()); customer.setOccupation(command.occupation());
        if (command.notes() != null) customer.setNotes(command.notes().trim());
        customer.setRouteId(route);
        String after=describe(customer);
        if (!before.equals(after)) {
            customers.save(customer);
            audit.save(new AuditLogEntity(UUID.randomUUID().toString(),actor.userId(),"CUSTOMER",customer.getId(),
                "EDITAR_CLIENTE",before,after,"Actualización de ficha",LocalDateTime.now().toString()));
        }
        return customer;
    }
    private String describe(CustomerEntity c) {
        return String.join("|",Objects.toString(c.getFullName(),""),Objects.toString(c.getPhone(),""),Objects.toString(c.getAltPhone(),""),
            Objects.toString(c.getAddress(),""),Objects.toString(c.getNeighborhood(),""),Objects.toString(c.getCity(),""),
            Objects.toString(c.getBusinessName(),""),Objects.toString(c.getOccupation(),""),Objects.toString(c.getNotes(),""),Objects.toString(c.getRouteId(),""));
    }
}
