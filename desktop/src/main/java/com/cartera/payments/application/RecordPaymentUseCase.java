package com.cartera.payments.application;

import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentAllocationEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentAllocationRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.installments.domain.Installment;
import com.cartera.installments.domain.InstallmentStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class RecordPaymentUseCase {
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final InstallmentRepository installmentRepository;
    private final LoanRepository loanRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final PaymentApplicationService applicationService = new PaymentApplicationService();

    public RecordPaymentUseCase(PaymentRepository paymentRepository,
                                PaymentAllocationRepository allocationRepository,
                                InstallmentRepository installmentRepository,
                                LoanRepository loanRepository,
                                CashMovementRepository cashMovementRepository,
                                AppUserRepository userRepository,
                                AuditLogRepository auditLogRepository) {
        this.paymentRepository = paymentRepository;
        this.allocationRepository = allocationRepository;
        this.installmentRepository = installmentRepository;
        this.loanRepository = loanRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
    }

    public record RecordPaymentCommand(
            String loanId,
            BigDecimal amount,
            String method,
            String collectorId,
            LocalDate paymentDate,
            String idempotencyKey
    ) {}

    public record PaymentExecutionResult(
            String paymentId,
            BigDecimal allocatedAmount,
            int installmentsAffectedCount,
            BigDecimal remainingLoanBalance,
            boolean isLoanFullyPaid
    ) {}

    @Transactional
    public PaymentExecutionResult execute(RecordPaymentCommand command) {
        Objects.requireNonNull(command.loanId(), "loanId is required");
        Objects.requireNonNull(command.amount(), "amount is required");
        if (command.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto a pagar debe ser positivo.");
        }

        String idempotencyKey = command.idempotencyKey() != null && !command.idempotencyKey().isBlank()
                ? command.idempotencyKey()
                : UUID.randomUUID().toString();

        var existing = paymentRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            // Idempotent replay: report the real persisted outcome, never a fabricated one.
            var p = existing.get();
            var current = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(p.getLoanId());
            BigDecimal balance = current.stream()
                    .map(InstallmentEntity::getPendingAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            int affected = allocationRepository.findByPaymentId(p.getId()).size();
            return new PaymentExecutionResult(p.getId(), p.getAmount(), affected, balance,
                    balance.signum() == 0);
        }

        LoanEntity loan = loanRepository.findById(command.loanId())
                .orElseThrow(() -> new IllegalArgumentException("Crédito no encontrado con ID: " + command.loanId()));
        if (!"ACTIVO".equals(loan.getStatus())) {
            throw new IllegalStateException("El crédito no está activo (estado: " + loan.getStatus() + "); no admite cobros.");
        }

        String collectorId = command.collectorId() != null ? command.collectorId() : loan.getCollectorId();
        if (collectorId == null || collectorId.isBlank()) {
            throw new IllegalArgumentException("Debe indicarse el cobrador que registra el pago.");
        }
        var collector = userRepository.findById(collectorId)
                .orElseThrow(() -> new IllegalArgumentException("Cobrador no registrado: " + collectorId));
        if (collector.getActive() == null || collector.getActive() != 1) {
            throw new IllegalStateException("El cobrador " + collector.getFullName() + " está inactivo y no puede registrar cobros.");
        }

        List<InstallmentEntity> installmentEntities = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(command.loanId());
        if (installmentEntities.isEmpty()) {
            throw new IllegalStateException("El crédito no posee cuotas registradas.");
        }

        // Mapear cuotas a objetos del dominio puro
        List<Installment> domainInstallments = new ArrayList<>();
        for (var entity : installmentEntities) {
            domainInstallments.add(new Installment(
                    UUID.fromString(entity.getId()),
                    entity.getInstallmentNumber(),
                    LocalDate.parse(entity.getDueDate()),
                    new Money(entity.getAmount()),
                    new Money(entity.getPaidAmount()),
                    InstallmentStatus.valueOf(entity.getStatus())
            ));
        }

        LocalDate pDate = command.paymentDate() != null ? command.paymentDate() : LocalDate.now();
        var domainResult = applicationService.allocate(new Money(command.amount()), domainInstallments, pDate);

        String paymentId = UUID.randomUUID().toString();
        String nowStr = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        PaymentEntity paymentEntity = new PaymentEntity(
                paymentId,
                idempotencyKey,
                loan.getId(),
                loan.getCustomerId(),
                collectorId,
                null,
                command.amount(),
                command.method() != null ? command.method() : "EFECTIVO",
                "APLICADO",
                nowStr,
                null
        );
        paymentRepository.save(paymentEntity);

        // Guardar distribuciones y actualizar cuotas
        for (var alloc : domainResult.allocations()) {
            String allocId = UUID.randomUUID().toString();
            PaymentAllocationEntity allocEntity = new PaymentAllocationEntity(
                    allocId,
                    paymentId,
                    alloc.installmentId().toString(),
                    alloc.amount().amount()
            );
            allocationRepository.save(allocEntity);
        }

        BigDecimal remainingBalance = BigDecimal.ZERO;
        boolean allPaid = true;

        for (var updatedDomainInst : domainResult.installments()) {
            var optEntity = installmentEntities.stream()
                    .filter(e -> e.getId().equals(updatedDomainInst.id().toString()))
                    .findFirst();
            if (optEntity.isPresent()) {
                var entity = optEntity.get();
                entity.setPaidAmount(updatedDomainInst.paid().amount());
                entity.setStatus(updatedDomainInst.status().name());
                installmentRepository.save(entity);

                remainingBalance = remainingBalance.add(entity.getPendingAmount());
                if (updatedDomainInst.status() != InstallmentStatus.PAGADA &&
                    updatedDomainInst.status() != InstallmentStatus.ADELANTADA) {
                    allPaid = false;
                }
            }
        }

        if (allPaid) {
            loan.setStatus("FINALIZADO");
            loanRepository.save(loan);
        }

        // Registrar movimiento de caja
        String cashMovementId = UUID.randomUUID().toString();
        CashMovementEntity cashMovement = new CashMovementEntity(
                cashMovementId,
                loan.getRouteId(),
                collectorId,
                null,
                "ENTRADA",
                "PAGO_CUOTA",
                command.amount(),
                paymentId,
                "Cobro de cuota crédito #" + loan.getId().substring(0, Math.min(8, loan.getId().length())),
                nowStr
        );
        cashMovementRepository.save(cashMovement);

        // Auditoría: misma transacción que el pago; si falla el registro, el pago se revierte.
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                collectorId,
                "PAYMENT",
                paymentId,
                "REGISTRAR_COBRO",
                null,
                "loan=" + loan.getId() + ";amount=" + command.amount().toPlainString()
                        + ";method=" + paymentEntity.getMethod()
                        + ";cuotas=" + domainResult.allocations().size()
                        + ";saldo=" + remainingBalance.toPlainString(),
                "Idempotency-Key=" + idempotencyKey,
                nowStr
        ));

        return new PaymentExecutionResult(
                paymentId,
                command.amount(),
                domainResult.allocations().size(),
                remainingBalance,
                allPaid
        );
    }
}
