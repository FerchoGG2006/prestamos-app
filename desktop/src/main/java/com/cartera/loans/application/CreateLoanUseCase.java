package com.cartera.loans.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Caso de uso transaccional y auditable para otorgar nuevos préstamos y generar sus planes de cuotas.
 */
@Service
public class CreateLoanUseCase {

    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final CustomerRepository customerRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;

    public CreateLoanUseCase(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            CustomerRepository customerRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository
    ) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.customerRepository = customerRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
    }

    public record CreateLoanCommand(
            String customerId,
            String routeId,
            String collectorId,
            BigDecimal principal,
            BigDecimal interestRate,
            BigDecimal totalAgreed,
            int installmentCount,
            String frequency,
            LocalDate startDate,
            String authorUserId
    ) {}

    public record InstallmentPlanItem(
            int installmentNumber,
            LocalDate dueDate,
            BigDecimal amount
    ) {}

    /** Simula el cronograma de cuotas sin persistir nada en base de datos. */
    public List<InstallmentPlanItem> simulatePlan(BigDecimal totalAgreed, int installmentCount, String frequency, LocalDate startDate) {
        Objects.requireNonNull(totalAgreed, "totalAgreed no puede ser nulo");
        Objects.requireNonNull(startDate, "startDate no puede ser nulo");
        if (installmentCount <= 0) {
            throw new IllegalArgumentException("La cantidad de cuotas debe ser mayor a cero.");
        }

        BigDecimal regularAmount = totalAgreed.divide(BigDecimal.valueOf(installmentCount), 2, RoundingMode.HALF_UP);
        BigDecimal sumCalculated = BigDecimal.ZERO;
        List<InstallmentPlanItem> items = new ArrayList<>();

        LocalDate currentDate = startDate;
        for (int i = 1; i <= installmentCount; i++) {
            currentDate = nextDate(currentDate, frequency, i == 1);

            BigDecimal cuota;
            if (i == installmentCount) {
                // Última cuota absorbe cualquier diferencia de centavos
                cuota = totalAgreed.subtract(sumCalculated);
            } else {
                cuota = regularAmount;
                sumCalculated = sumCalculated.add(cuota);
            }

            items.add(new InstallmentPlanItem(i, currentDate, cuota));
        }

        return items;
    }

    private LocalDate nextDate(LocalDate date, String frequency, boolean isFirst) {
        if (isFirst) {
            // Si el primer día cae domingo en cobro diario, saltar al lunes
            if ("DIARIO".equalsIgnoreCase(frequency) && date.getDayOfWeek() == DayOfWeek.SUNDAY) {
                return date.plusDays(1);
            }
            return date;
        }

        String freq = frequency != null ? frequency.toUpperCase() : "DIARIO";
        return switch (freq) {
            case "SEMANAL" -> date.plusWeeks(1);
            case "QUINCENAL" -> date.plusDays(15);
            case "MENSUAL" -> date.plusMonths(1);
            case "DIARIO" -> {
                LocalDate next = date.plusDays(1);
                if (next.getDayOfWeek() == DayOfWeek.SUNDAY) {
                    next = next.plusDays(1); // Saltar domingo
                }
                yield next;
            }
            default -> date.plusDays(1);
        };
    }

    @Transactional
    public LoanEntity execute(CreateLoanCommand cmd) {
        Objects.requireNonNull(cmd, "El comando no puede ser nulo");

        if (cmd.customerId() == null || cmd.customerId().isBlank()) {
            throw new IllegalArgumentException("Debe seleccionar un cliente.");
        }
        if (!customerRepository.existsById(cmd.customerId())) {
            throw new IllegalArgumentException("El cliente seleccionado no existe.");
        }
        if (cmd.principal() == null || cmd.principal().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto principal de capital debe ser mayor a cero.");
        }
        if (cmd.totalAgreed() == null || cmd.totalAgreed().compareTo(cmd.principal()) < 0) {
            throw new IllegalArgumentException("El total pactado no puede ser menor al capital prestado.");
        }
        if (cmd.installmentCount() <= 0) {
            throw new IllegalArgumentException("El número de cuotas debe ser mayor a cero.");
        }

        String loanId = UUID.randomUUID().toString();
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        String nowDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);

        BigDecimal interestAmount = cmd.totalAgreed().subtract(cmd.principal());
        BigDecimal rate = cmd.interestRate() != null ? cmd.interestRate() :
                interestAmount.divide(cmd.principal(), 4, RoundingMode.HALF_UP);

        List<InstallmentPlanItem> plan = simulatePlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.startDate());
        LocalDate endDate = plan.get(plan.size() - 1).dueDate();

        // 1. Guardar Préstamo
        LoanEntity loan = new LoanEntity(
                loanId,
                cmd.customerId(),
                cmd.routeId() != null ? cmd.routeId() : "route-norte",
                cmd.collectorId() != null ? cmd.collectorId() : "usr-col-1",
                null,
                "NUEVO",
                cmd.principal(),
                rate,
                interestAmount,
                cmd.totalAgreed(),
                cmd.installmentCount(),
                cmd.frequency() != null ? cmd.frequency().toUpperCase() : "DIARIO",
                cmd.startDate().format(DateTimeFormatter.ISO_LOCAL_DATE),
                endDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                "ACTIVO",
                nowTime
        );
        loanRepository.save(loan);

        // 2. Guardar Cuotas
        for (InstallmentPlanItem item : plan) {
            InstallmentEntity inst = new InstallmentEntity(
                    UUID.randomUUID().toString(),
                    loanId,
                    item.installmentNumber(),
                    item.dueDate().format(DateTimeFormatter.ISO_LOCAL_DATE),
                    item.amount(),
                    BigDecimal.ZERO,
                    "PENDIENTE"
            );
            installmentRepository.save(inst);
        }

        // 3. Registrar egreso en caja por desembolso
        String userId = cmd.authorUserId() != null ? cmd.authorUserId() : cmd.collectorId();
        CashMovementEntity cashMovement = new CashMovementEntity(
                UUID.randomUUID().toString(),
                loan.getRouteId(),
                userId,
                null,
                "EGRESO",
                "DESEMBOLSO",
                cmd.principal(),
                loanId,
                "Desembolso de crédito para cliente ID " + cmd.customerId(),
                nowTime
        );
        cashMovementRepository.save(cashMovement);

        // 4. Registro de auditoría
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                userId,
                "LOAN",
                loanId,
                "DESEMBOLSO_CREDITO",
                null,
                "Capital: " + cmd.principal() + " Total: " + cmd.totalAgreed() + " Cuotas: " + cmd.installmentCount(),
                "Aprobación y desembolso de nuevo crédito",
                nowTime
        ));

        return loan;
    }
}
