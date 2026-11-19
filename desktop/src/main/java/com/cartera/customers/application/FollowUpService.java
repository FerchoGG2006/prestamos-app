package com.cartera.customers.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentPromiseRepository;
import com.cartera.infrastructure.security.FinancialAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class FollowUpService {

    private final LoanRepository loans;
    private final InstallmentRepository installments;
    private final PaymentPromiseRepository promises;
    private final AuditLogRepository audit;
    private final FinancialAccess access;

    public FollowUpService(
            LoanRepository loans,
            InstallmentRepository installments,
            PaymentPromiseRepository promises,
            AuditLogRepository audit,
            FinancialAccess access
    ) {
        this.loans = loans;
        this.installments = installments;
        this.promises = promises;
        this.audit = audit;
        this.access = access;
    }

    private LoanEntity authorized(String id) {
        var loan = loans.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Crédito no encontrado."));
        access.collector(loan.getCollectorId());
        return loan;
    }

    @Transactional
    public PaymentPromiseEntity promise(String id, String loanId, BigDecimal amount, LocalDate date, String notes) {
        var loan = authorized(loanId);
        var actor = access.actor();
        if (id == null || id.isBlank()
                || amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 0
                || date == null || date.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("Revise identificador, monto en pesos y fecha de la promesa.");
        }
        var existing = promises.findById(id);
        if (existing.isPresent()) {
            var saved = existing.get();
            if (!loanId.equals(saved.getLoanId())
                    || amount.compareTo(saved.getAmount()) != 0
                    || !date.toString().equals(saved.getPromisedDate())
                    || !Objects.equals(notes, saved.getNotes())) {
                throw new IllegalArgumentException("La promesa ya existe con otros datos.");
            }
            return saved;
        }
        if (!"ACTIVO".equals(loan.getStatus())) {
            throw new IllegalStateException("Solo un crédito activo admite nuevas promesas.");
        }
        var balance = installments.findByLoanId(loanId).stream()
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (amount.compareTo(balance) > 0) {
            throw new IllegalArgumentException("La promesa supera el saldo del crédito.");
        }
        var result = promises.save(new PaymentPromiseEntity(
                id, loan.getCustomerId(), loanId, amount, date.toString(),
                "PENDIENTE", notes, LocalDateTime.now().toString()
        ));
        audit.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                actor.userId(),
                "PAYMENT_PROMISE",
                id,
                "REGISTRAR_PROMESA",
                null,
                amount.toPlainString() + ";fecha=" + date,
                notes,
                LocalDateTime.now().toString()
        ));
        return result;
    }

    @Transactional
    public void resolve(String id, String status, String reason) {
        var saved = promises.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Promesa no encontrada."));
        authorized(saved.getLoanId());
        var actor = access.actor();
        if (!List.of("CUMPLIDA", "CANCELADA").contains(status) || reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Estado y motivo obligatorios.");
        }
        if (status.equals(saved.getStatus())) {
            return;
        }
        if (!"PENDIENTE".equals(saved.getStatus())) {
            throw new IllegalStateException("La promesa ya fue resuelta.");
        }
        saved.setStatus(status);
        promises.save(saved);
        audit.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                actor.userId(),
                "PAYMENT_PROMISE",
                id,
                "RESOLVER_PROMESA",
                "PENDIENTE",
                status,
                reason + "; declaración de seguimiento, no registra pago",
                LocalDateTime.now().toString()
        ));
    }

    @Transactional
    public void visit(String id, String loanId, String reason) {
        var loan = authorized(loanId);
        var actor = access.actor();
        if (id == null || id.isBlank() || reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Identificador y motivo de visita obligatorios.");
        }
        var existing = audit.findById(id);
        if (existing.isPresent()) {
            var previous = existing.get();
            if (!loanId.equals(previous.getEntityId())
                    || !"NON_PAYMENT_VISIT".equals(previous.getEntityType())
                    || !reason.trim().equals(previous.getReason())) {
                throw new IllegalArgumentException("Identificador de visita usado por otra operación.");
            }
            return;
        }
        audit.save(new AuditLogEntity(
                id,
                actor.userId(),
                "NON_PAYMENT_VISIT",
                loanId,
                "VISITA_NO_PAGO",
                null,
                "Cliente=" + loan.getCustomerId(),
                reason.trim(),
                LocalDateTime.now().toString()
        ));
    }

    @Transactional(readOnly = true)
    public List<PaymentPromiseEntity> promises(String customerId) {
        var actor = access.actor();
        return promises.findAll().stream()
                .filter(p -> customerId == null || customerId.equals(p.getCustomerId()))
                .filter(p -> loans.findById(p.getLoanId())
                        .map(l -> actor.canReverseOrCancel() || actor.userId().equals(l.getCollectorId()))
                        .orElse(false))
                .sorted(Comparator.comparing(PaymentPromiseEntity::getPromisedDate))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AuditLogEntity> visits(String customerId) {
        var ids = loans.findByCustomerId(customerId).stream()
                .filter(l -> {
                    access.collector(l.getCollectorId());
                    return true;
                })
                .map(LoanEntity::getId)
                .toList();
        return audit.findAll().stream()
                .filter(a -> "NON_PAYMENT_VISIT".equals(a.getEntityType()) && ids.contains(a.getEntityId()))
                .sorted(Comparator.comparing(AuditLogEntity::getCreatedAt).reversed())
                .toList();
    }
}
