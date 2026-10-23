package com.cartera.loans.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Caso de uso para anular un crédito desembolsado por error.
 * Operación estrictamente restringida a roles ADMIN y SUPERVISOR.
 */
@Service
public class CancelLoanUseCase {

    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;

    public CancelLoanUseCase(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            PaymentRepository paymentRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository
    ) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional
    public LoanEntity execute(String loanId, String reason) {
        // 1. Validación estricta de rol (Solo ADMIN y SUPERVISOR)
        Optional<UserSession> sessionOpt = UserSessionContext.getSession();
        if (sessionOpt.isEmpty() || sessionOpt.get().isCollector() || !sessionOpt.get().canReverseOrCancel()) {
            throw new SecurityException("Operación restringida exclusivamente a Administradores y Supervisores.");
        }
        UserSession session = sessionOpt.get();

        if (loanId == null || loanId.isBlank()) {
            throw new IllegalArgumentException("El identificador del crédito es obligatorio.");
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new IllegalArgumentException("Debe ingresar un motivo obligatorio para anular el crédito.");
        }

        LoanEntity loan = loanRepository.findById(loanId)
                .orElseThrow(() -> new IllegalArgumentException("No se encontró el crédito con ID: " + loanId));

        if ("ANULADO".equalsIgnoreCase(loan.getStatus())) {
            throw new IllegalStateException("Este crédito ya se encuentra anulado.");
        }

        List<PaymentEntity> activePayments = paymentRepository.findByLoanId(loanId).stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .toList();
        if (!activePayments.isEmpty()) {
            throw new IllegalStateException("El crédito tiene " + activePayments.size() + " pago(s) activo(s). Anule primero los pagos antes de anular el contrato.");
        }

        String prevStatus = loan.getStatus();
        loan.setStatus("ANULADO");
        loanRepository.save(loan);

        List<InstallmentEntity> installments = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loanId);
        for (InstallmentEntity inst : installments) {
            inst.setPaidAmount(inst.getAmount());
            inst.setStatus("ANULADA");
            installmentRepository.save(inst);
        }

        // Determinar el monto neto desembolsado originalmente para revertirlo a la caja
        BigDecimal disbursedToRestore = cashMovementRepository.findAll().stream()
                .filter(m -> loanId.equals(m.getReferenceId()) && ("EGRESO".equalsIgnoreCase(m.getMovementType()) || "SALIDA".equalsIgnoreCase(m.getMovementType())))
                .map(CashMovementEntity::getAmount)
                .findFirst()
                .orElse(loan.getPrincipal());

        String nowStr = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        CashMovementEntity compensatingInflow = new CashMovementEntity(
                UUID.randomUUID().toString(),
                loan.getRouteId() != null ? loan.getRouteId() : "route-norte",
                session.userId(),
                null,
                "INGRESO",
                "ANULACION_CREDITO",
                disbursedToRestore,
                loan.getId(),
                "Reintegro a caja por anulación de crédito #" + loan.getId().substring(0, Math.min(8, loan.getId().length())) + " — Motivo: " + reason.trim(),
                nowStr
        );
        cashMovementRepository.save(compensatingInflow);

        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                session.userId(),
                "LOAN",
                loan.getId(),
                "ANULAR_CREDITO",
                "status=" + prevStatus + ";principal=" + loan.getPrincipal().toPlainString(),
                "status=ANULADO;reintegroCaja=" + disbursedToRestore.toPlainString(),
                reason.trim(),
                nowStr
        ));

        return loan;
    }
}
