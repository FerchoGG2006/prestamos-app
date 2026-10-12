package com.cartera.renewals.application;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.loans.application.CreateLoanUseCase;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Caso de uso atómico para renovación y reestructuración de créditos.
 * Liquida el crédito anterior y genera el nuevo deduciendo el saldo pendiente.
 */
@Service
public class RenewLoanUseCase {

    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final RenewalRepository renewalRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;
    private final CreateLoanUseCase createLoanUseCase;

    public RenewLoanUseCase(LoanRepository loanRepository,
                            InstallmentRepository installmentRepository,
                            RenewalRepository renewalRepository,
                            CashMovementRepository cashMovementRepository,
                            AuditLogRepository auditLogRepository,
                            CreateLoanUseCase createLoanUseCase) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.renewalRepository = renewalRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
        this.createLoanUseCase = createLoanUseCase;
    }

    public record RenewLoanCommand(
            String previousLoanId,
            BigDecimal newPrincipal,
            BigDecimal interestRate,
            BigDecimal totalAgreed,
            int installmentCount,
            String frequency,
            LocalDate startDate,
            BigDecimal paperworkFee,
            String authorUserId
    ) {}

    public record RenewalResult(
            String newLoanId,
            BigDecimal previousBalanceDeducted,
            BigDecimal cashDisbursed,
            BigDecimal totalAgreed
    ) {}

    @Transactional
    public RenewalResult execute(RenewLoanCommand cmd) {
        Objects.requireNonNull(cmd, "El comando no puede ser nulo");

        LoanEntity previousLoan = loanRepository.findById(cmd.previousLoanId())
                .orElseThrow(() -> new IllegalArgumentException("No se encontró el crédito anterior ID: " + cmd.previousLoanId()));

        if (!"ACTIVO".equalsIgnoreCase(previousLoan.getStatus())) {
            throw new IllegalStateException("Solo se pueden renovar créditos en estado ACTIVO.");
        }

        // Calcular saldo restante del crédito anterior
        List<InstallmentEntity> previousInstallments = installmentRepository.findByLoanId(cmd.previousLoanId());
        BigDecimal previousBalance = previousInstallments.stream()
                .filter(i -> "PENDIENTE".equalsIgnoreCase(i.getStatus()))
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal paperwork = cmd.paperworkFee() != null ? cmd.paperworkFee() : BigDecimal.ZERO;
        BigDecimal cashToDisburse = cmd.newPrincipal().subtract(previousBalance).subtract(paperwork);

        if (cashToDisburse.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("El nuevo capital ($" + cmd.newPrincipal() + ") no alcanza para cubrir el saldo pendiente ($" + previousBalance + ").");
        }

        String newLoanId = UUID.randomUUID().toString();
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        String userId = cmd.authorUserId() != null ? cmd.authorUserId() : previousLoan.getCollectorId();

        // 1. Finalizar crédito viejo y marcar sus cuotas como canceladas por renovación
        previousLoan.setStatus("FINALIZADO");
        loanRepository.save(previousLoan);

        for (InstallmentEntity inst : previousInstallments) {
            if ("PENDIENTE".equalsIgnoreCase(inst.getStatus())) {
                inst.setStatus("PAGADA");
                inst.setPaidAmount(inst.getAmount());
                installmentRepository.save(inst);
            }
        }

        // 2. Crear nuevo crédito
        var plan = createLoanUseCase.simulatePlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.startDate());
        LocalDate endDate = plan.get(plan.size() - 1).dueDate();

        LoanEntity newLoan = new LoanEntity(
                newLoanId,
                previousLoan.getCustomerId(),
                previousLoan.getRouteId(),
                userId,
                previousLoan.getId(),
                "RENOVACION",
                cmd.newPrincipal(),
                cmd.interestRate(),
                cmd.totalAgreed().subtract(cmd.newPrincipal()),
                cmd.totalAgreed(),
                cmd.installmentCount(),
                cmd.frequency(),
                cmd.startDate().format(DateTimeFormatter.ISO_LOCAL_DATE),
                endDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                "ACTIVO",
                nowTime
        );
        loanRepository.save(newLoan);

        // 3. Crear cuotas del nuevo crédito
        for (var item : plan) {
            installmentRepository.save(new InstallmentEntity(
                    UUID.randomUUID().toString(),
                    newLoanId,
                    item.installmentNumber(),
                    item.dueDate().format(DateTimeFormatter.ISO_LOCAL_DATE),
                    item.amount(),
                    BigDecimal.ZERO,
                    "PENDIENTE"
            ));
        }

        // 4. Guardar registro de Renewal
        String renewalId = UUID.randomUUID().toString();
        RenewalEntity renewal = new RenewalEntity(
                renewalId,
                previousLoan.getId(),
                newLoanId,
                cmd.newPrincipal(),
                previousBalance,
                paperwork,
                cashToDisburse,
                nowTime
        );
        renewalRepository.save(renewal);

        // 5. Movimiento de caja por el efectivo neto entregado
        if (cashToDisburse.compareTo(BigDecimal.ZERO) > 0) {
            cashMovementRepository.save(new CashMovementEntity(
                    UUID.randomUUID().toString(),
                    previousLoan.getRouteId(),
                    userId,
                    null,
                    "EGRESO",
                    "DESEMBOLSO_RENOVACION",
                    cashToDisburse,
                    newLoanId,
                    "Desembolso neto por renovación crédito anterior ID: " + previousLoan.getId(),
                    nowTime
            ));
        }

        // 6. Auditoría
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                userId,
                "RENEWAL",
                renewalId,
                "RENOVACION_CREDITO",
                "Crédito anterior: " + previousLoan.getId() + " Saldo: " + previousBalance,
                "Nuevo crédito: " + newLoanId + " Capital: " + cmd.newPrincipal() + " Desembolso neto: " + cashToDisburse,
                "Renovación y reestructuración de crédito",
                nowTime
        ));

        return new RenewalResult(newLoanId, previousBalance, cashToDisburse, cmd.totalAgreed());
    }
}
