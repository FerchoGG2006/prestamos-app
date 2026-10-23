package com.cartera.loans.application;

import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.loans.domain.LoanCalculator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
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
    private final SystemSettingRepository settingRepository;

    public CreateLoanUseCase(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            CustomerRepository customerRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository
    ) {
        this(loanRepository, installmentRepository, customerRepository, cashMovementRepository, auditLogRepository, null);
    }

    @Autowired
    public CreateLoanUseCase(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            CustomerRepository customerRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository,
            SystemSettingRepository settingRepository
    ) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.customerRepository = customerRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
        this.settingRepository = settingRepository;
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
            String authorUserId,
            BigDecimal paperworkFee,
            boolean isMigration,
            Set<Integer> paidInstallmentNumbers,
            String cardPhotoPath,
            String migrationNotes
    ) {
        public CreateLoanCommand(
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
        ) {
            this(customerId, routeId, collectorId, principal, interestRate, totalAgreed, installmentCount, frequency, startDate, authorUserId, null, false, Collections.emptySet(), null, null);
        }

        public CreateLoanCommand(
                String customerId,
                String routeId,
                String collectorId,
                BigDecimal principal,
                BigDecimal interestRate,
                BigDecimal totalAgreed,
                int installmentCount,
                String frequency,
                LocalDate startDate,
                String authorUserId,
                BigDecimal paperworkFee
        ) {
            this(customerId, routeId, collectorId, principal, interestRate, totalAgreed, installmentCount, frequency, startDate, authorUserId, paperworkFee, false, Collections.emptySet(), null, null);
        }
    }

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

        boolean excludeSundays = isExcludeSundaysEnabled();
        BigDecimal regularAmount = totalAgreed.divide(BigDecimal.valueOf(installmentCount), 2, RoundingMode.HALF_UP);
        BigDecimal sumCalculated = BigDecimal.ZERO;
        List<InstallmentPlanItem> items = new ArrayList<>();

        LocalDate currentDate = startDate;
        for (int i = 1; i <= installmentCount; i++) {
            currentDate = nextDate(currentDate, frequency, excludeSundays);

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

    private boolean isExcludeSundaysEnabled() {
        if (settingRepository == null) return true;
        return settingRepository.findById("exclude_sundays")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
    }

    public BigDecimal resolvePaperworkFee(BigDecimal principal, BigDecimal explicitFee) {
        if (explicitFee != null) {
            return explicitFee.max(BigDecimal.ZERO);
        }
        boolean enabled = settingRepository == null || settingRepository.findById("paperwork_enabled")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
        if (!enabled) {
            return BigDecimal.ZERO;
        }
        BigDecimal feeRate = BigDecimal.valueOf(5000);
        if (settingRepository != null) {
            var optRate = settingRepository.findById("paperwork_fee");
            if (optRate.isPresent()) {
                try {
                    String raw = optRate.get().getSettingValue().replaceAll("[^0-9]", "");
                    if (!raw.isEmpty()) {
                        feeRate = new BigDecimal(raw);
                    }
                } catch (Exception ignored) {}
            }
        }
        return LoanCalculator.calculatePaperworkFee(new Money(principal), feeRate).amount();
    }

    private LocalDate nextDate(LocalDate date, String frequency, boolean excludeSundays) {
        String freq = frequency != null ? frequency.toUpperCase() : "DIARIO";
        return switch (freq) {
            case "SEMANAL" -> date.plusWeeks(1);
            case "QUINCENAL" -> date.plusDays(15);
            case "MENSUAL" -> date.plusMonths(1);
            case "DIARIO" -> {
                LocalDate next = date.plusDays(1);
                if (excludeSundays && next.getDayOfWeek() == DayOfWeek.SUNDAY) {
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
        if (settingRepository != null) {
            settingRepository.findById("max_new_loan_amount").ifPresent(s -> {
                try {
                    String clean = s.getSettingValue().replaceAll("[^0-9]", "");
                    if (!clean.isEmpty()) {
                        BigDecimal max = new BigDecimal(clean);
                        if (max.compareTo(BigDecimal.ZERO) > 0 && cmd.principal().compareTo(max) > 0) {
                            throw new IllegalArgumentException("El capital solicitado supera el monto máximo permitido para préstamos nuevos ($" + max.toPlainString() + ").");
                        }
                    }
                } catch (IllegalArgumentException e) {
                    throw e;
                } catch (Exception ignored) {}
            });
        }
        if (cmd.totalAgreed() == null || cmd.totalAgreed().compareTo(cmd.principal()) < 0) {
            throw new IllegalArgumentException("El total pactado no puede ser menor al capital prestado.");
        }
        if (cmd.installmentCount() <= 0) {
            throw new IllegalArgumentException("El número de cuotas debe ser mayor a cero.");
        }

        String loanId = UUID.randomUUID().toString();
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        BigDecimal interestAmount = cmd.totalAgreed().subtract(cmd.principal());
        BigDecimal rate = cmd.interestRate() != null ? cmd.interestRate() :
                interestAmount.divide(cmd.principal(), 4, RoundingMode.HALF_UP);

        List<InstallmentPlanItem> plan = simulatePlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.startDate());
        LocalDate endDate = plan.get(plan.size() - 1).dueDate();

        String routeId = (cmd.routeId() != null && !cmd.routeId().isBlank() && !"route-1".equalsIgnoreCase(cmd.routeId()))
                ? cmd.routeId()
                : "route-norte";

        String opType = cmd.isMigration() ? "MIGRACION" : "NUEVO";

        // 1. Guardar Préstamo
        LoanEntity loan = new LoanEntity(
                loanId,
                cmd.customerId(),
                routeId,
                cmd.collectorId() != null ? cmd.collectorId() : "usr-col-1",
                null,
                opType,
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

        // 2. Guardar Cuotas (saldando las cuotas pagadas en la cartulina física si es migración)
        Set<Integer> paidNumbers = cmd.paidInstallmentNumbers() != null ? cmd.paidInstallmentNumbers() : Collections.emptySet();
        BigDecimal totalMigratedPaid = BigDecimal.ZERO;

        for (InstallmentPlanItem item : plan) {
            boolean isPrePaid = cmd.isMigration() && paidNumbers.contains(item.installmentNumber());
            BigDecimal paid = isPrePaid ? item.amount() : BigDecimal.ZERO;
            String status = isPrePaid ? "PAGADA" : "PENDIENTE";
            if (isPrePaid) {
                totalMigratedPaid = totalMigratedPaid.add(paid);
            }

            InstallmentEntity inst = new InstallmentEntity(
                    UUID.randomUUID().toString(),
                    loanId,
                    item.installmentNumber(),
                    item.dueDate().format(DateTimeFormatter.ISO_LOCAL_DATE),
                    item.amount(),
                    paid,
                    status
            );
            installmentRepository.save(inst);
        }

        // Si todas las cuotas de la cartulina ya fueron pagadas, el crédito nace completado
        if (cmd.isMigration() && paidNumbers.size() >= cmd.installmentCount()) {
            loan.setStatus("COMPLETADO");
            loanRepository.save(loan);
        }

        // 3. Registrar egreso en caja SOLO si es un desembolso nuevo de hoy.
        // SI ES MIGRACIÓN DE CARTULINA FÍSICA PREEXISTENTE, NO GENERA EGRESO EN CAJA (el dinero salió en el pasado).
        BigDecimal paperworkFee = resolvePaperworkFee(cmd.principal(), cmd.paperworkFee());
        BigDecimal netDisbursed = cmd.principal().subtract(paperworkFee).max(BigDecimal.ZERO);
        String userId = cmd.authorUserId() != null ? cmd.authorUserId() : cmd.collectorId();

        if (!cmd.isMigration()) {
            CashMovementEntity cashMovement = new CashMovementEntity(
                    UUID.randomUUID().toString(),
                    loan.getRouteId(),
                    userId,
                    null,
                    "EGRESO",
                    "DESEMBOLSO",
                    netDisbursed,
                    loanId,
                    "Desembolso neto de crédito para cliente ID " + cmd.customerId()
                            + (paperworkFee.compareTo(BigDecimal.ZERO) > 0 ? " (Capital: $" + cmd.principal() + " - Papelería: $" + paperworkFee + ")" : ""),
                    nowTime
            );
            cashMovementRepository.save(cashMovement);
        }

        // 4. Registro de auditoría
        String auditAction = cmd.isMigration() ? "MIGRACION_CARTERA_INICIAL" : "DESEMBOLSO_CREDITO";
        String auditDesc = cmd.isMigration()
                ? "Migración de cartulina física preexistente. Cuotas saldadas en papel: " + paidNumbers.size() + "/" + cmd.installmentCount() + " ($" + totalMigratedPaid + "). Saldo restante: $" + cmd.totalAgreed().subtract(totalMigratedPaid) + (cmd.cardPhotoPath() != null ? " [Foto adjunta: " + cmd.cardPhotoPath() + "]" : "")
                : "Aprobación y desembolso de nuevo crédito";

        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                userId,
                "LOAN",
                loanId,
                auditAction,
                null,
                "Capital: " + cmd.principal() + " Papelería: " + paperworkFee + " Neto: " + netDisbursed + " Total: " + cmd.totalAgreed() + " Cuotas: " + cmd.installmentCount() + (cmd.isMigration() ? " [MIGRADO]" : ""),
                auditDesc,
                nowTime
        ));

        return loan;
    }
}
