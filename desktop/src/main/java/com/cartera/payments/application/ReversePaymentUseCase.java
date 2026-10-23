package com.cartera.payments.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentAllocationEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentAllocationRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Caso de uso para reversar/anular un pago aplicado por error.
 * Operación estrictamente restringida a roles ADMIN y SUPERVISOR.
 */
@Service
public class ReversePaymentUseCase {

    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final InstallmentRepository installmentRepository;
    private final LoanRepository loanRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;

    public ReversePaymentUseCase(
            PaymentRepository paymentRepository,
            PaymentAllocationRepository allocationRepository,
            InstallmentRepository installmentRepository,
            LoanRepository loanRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository
    ) {
        this.paymentRepository = paymentRepository;
        this.allocationRepository = allocationRepository;
        this.installmentRepository = installmentRepository;
        this.loanRepository = loanRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
    }

    public record ReversePaymentResult(
            String paymentId,
            String loanId,
            BigDecimal reversedAmount,
            int installmentsRestored,
            BigDecimal updatedLoanBalance
    ) {}

    @Transactional
    public ReversePaymentResult execute(String paymentId, String reason) {
        // 1. Validación estricta de rol (Solo ADMIN y SUPERVISOR)
        Optional<UserSession> sessionOpt = UserSessionContext.getSession();
        if (sessionOpt.isEmpty() || sessionOpt.get().isCollector() || !sessionOpt.get().canReverseOrCancel()) {
            throw new SecurityException("Operación restringida exclusivamente a Administradores y Supervisores.");
        }
        UserSession session = sessionOpt.get();

        if (paymentId == null || paymentId.isBlank()) {
            throw new IllegalArgumentException("El identificador del pago es obligatorio.");
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new IllegalArgumentException("Debe ingresar un motivo de auditoría obligatorio para anular el pago.");
        }

        PaymentEntity payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("No se encontró el pago con ID: " + paymentId));

        if ("ANULADO".equalsIgnoreCase(payment.getStatus())) {
            throw new IllegalStateException("Este pago ya fue anulado previamente.");
        }

        LoanEntity loan = loanRepository.findById(payment.getLoanId())
                .orElseThrow(() -> new IllegalStateException("No se encontró el crédito asociado: " + payment.getLoanId()));

        List<PaymentAllocationEntity> allocations = allocationRepository.findByPaymentId(paymentId);
        String todayStr = LocalDate.now().toString();
        int restoredCount = 0;

        for (PaymentAllocationEntity alloc : allocations) {
            Optional<InstallmentEntity> instOpt = installmentRepository.findById(alloc.getInstallmentId());
            if (instOpt.isPresent()) {
                InstallmentEntity inst = instOpt.get();
                BigDecimal currentPaid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
                BigDecimal newPaid = currentPaid.subtract(alloc.getAmount());
                if (newPaid.compareTo(BigDecimal.ZERO) < 0) {
                    newPaid = BigDecimal.ZERO;
                }
                inst.setPaidAmount(newPaid);

                if (newPaid.compareTo(BigDecimal.ZERO) == 0) {
                    if (inst.getDueDate() != null && inst.getDueDate().compareTo(todayStr) < 0) {
                        inst.setStatus("VENCIDA");
                    } else {
                        inst.setStatus("PENDIENTE");
                    }
                } else if (newPaid.compareTo(inst.getAmount()) < 0) {
                    inst.setStatus("PARCIAL");
                } else {
                    inst.setStatus("PAGADA");
                }
                installmentRepository.save(inst);
                restoredCount++;
            }
        }

        if (!allocations.isEmpty()) {
            allocationRepository.deleteAll(allocations);
        }

        // Recalcular saldo del préstamo y reabrir si estaba FINALIZADO/PAGADO
        List<InstallmentEntity> allInstallments = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
        BigDecimal updatedBalance = allInstallments.stream()
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (("FINALIZADO".equalsIgnoreCase(loan.getStatus()) || "PAGADO".equalsIgnoreCase(loan.getStatus()))
                && updatedBalance.compareTo(BigDecimal.ZERO) > 0) {
            loan.setStatus("ACTIVO");
            loanRepository.save(loan);
        }

        // Marcar pago como ANULADO
        String prevStatus = payment.getStatus();
        payment.setStatus("ANULADO");
        payment.setAnnulmentReason(reason.trim());
        paymentRepository.save(payment);

        String nowStr = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        // Movimiento compensatorio en caja
        CashMovementEntity reversalMovement = new CashMovementEntity(
                UUID.randomUUID().toString(),
                loan.getRouteId() != null ? loan.getRouteId() : "route-norte",
                session.userId(),
                payment.getSessionId(),
                "EGRESO",
                "ANULACION_PAGO",
                payment.getAmount(),
                payment.getId(),
                "Reversión de pago #" + payment.getId().substring(0, Math.min(8, payment.getId().length())) + " — Motivo: " + reason.trim(),
                nowStr
        );
        cashMovementRepository.save(reversalMovement);

        // Registro de auditoría inmutable
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                session.userId(),
                "PAYMENT",
                payment.getId(),
                "ANULAR_PAGO",
                "status=" + prevStatus + ";amount=" + payment.getAmount().toPlainString(),
                "status=ANULADO;loan=" + loan.getId() + ";nuevoSaldo=" + updatedBalance.toPlainString(),
                reason.trim(),
                nowStr
        ));

        return new ReversePaymentResult(
                payment.getId(),
                loan.getId(),
                payment.getAmount(),
                restoredCount,
                updatedBalance
        );
    }
}
