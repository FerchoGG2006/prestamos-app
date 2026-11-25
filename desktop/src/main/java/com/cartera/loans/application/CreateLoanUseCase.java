package com.cartera.loans.application;

import com.cartera.infrastructure.security.FinancialAccess;

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

    private final FinancialAccess access;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final CustomerRepository customerRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;
    private final SystemSettingRepository settingRepository;

    @Autowired
    public CreateLoanUseCase(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            CustomerRepository customerRepository,
            CashMovementRepository cashMovementRepository,
            AuditLogRepository auditLogRepository,
            SystemSettingRepository settingRepository, FinancialAccess access
    ) {
        this.access = access;
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
            String migrationNotes,
            LocalDate nextDueDate
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
            this(customerId, routeId, collectorId, principal, interestRate, totalAgreed, installmentCount, frequency, startDate, authorUserId, null, false, Collections.emptySet(), null, null, null);
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
            this(customerId, routeId, collectorId, principal, interestRate, totalAgreed, installmentCount, frequency, startDate, authorUserId, paperworkFee, false, Collections.emptySet(), null, null, null);
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
                BigDecimal paperworkFee,
                boolean isMigration,
                Set<Integer> paidInstallmentNumbers,
                String cardPhotoPath,
                String migrationNotes
        ) {
            this(customerId, routeId, collectorId, principal, interestRate, totalAgreed, installmentCount, frequency, startDate, authorUserId, paperworkFee, isMigration, paidInstallmentNumbers, cardPhotoPath, migrationNotes, null);
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

        if ("FECHA_FIJA".equalsIgnoreCase(frequency) || "FECHA FIJA".equalsIgnoreCase(frequency) || "FIXED_DATE".equalsIgnoreCase(frequency)) {
            List<InstallmentPlanItem> singleItem = new ArrayList<>();
            singleItem.add(new InstallmentPlanItem(1, startDate, new Money(totalAgreed).amount()));
            return singleItem;
        }

        boolean excludeSundays = isExcludeSundaysEnabled();
        BigDecimal exactTotal = new Money(totalAgreed).amount();
        // Cuotas en pesos enteros (scale = 0) para compatibilidad estricta con RecordPaymentUseCase y RenewLoanUseCase
        BigDecimal regularAmount = exactTotal.divide(BigDecimal.valueOf(installmentCount), 0, RoundingMode.DOWN);
        BigDecimal sumCalculated = BigDecimal.ZERO;
        List<InstallmentPlanItem> items = new ArrayList<>();

        LocalDate currentDate = startDate;
        for (int i = 1; i <= installmentCount; i++) {
            currentDate = nextDate(currentDate, frequency, excludeSundays);

            BigDecimal cuota;
            if (i == installmentCount) {
                // Última cuota absorbe cualquier residuo entero
                cuota = exactTotal.subtract(sumCalculated);
            } else {
                cuota = regularAmount;
                sumCalculated = sumCalculated.add(cuota);
            }

            items.add(new InstallmentPlanItem(i, currentDate, cuota));
        }

        return items;
    }

    public static boolean isFixedDateFrequency(String frequency) {
        if (frequency == null) return false;
        String f = frequency.trim().toUpperCase();
        return "FECHA_FIJA".equals(f) || "FECHA FIJA".equals(f) || "FIXED_DATE".equals(f);
    }

    /** Retorna la próxima ocurrencia (>= today) del día de semana solicitado (Lun..Sáb). */
    public static LocalDate upcomingWeekday(LocalDate today, DayOfWeek target) {
        int diff = (target.getValue() - today.getDayOfWeek().getValue() + 7) % 7;
        return today.plusDays(diff);
    }

    /** Avanza (+1) o retrocede (-1) una fecha exactamente un periodo según modalidad. */
    public static LocalDate stepDate(LocalDate date, String frequency, int direction, boolean excludeSundays) {
        String freq = frequency != null ? frequency.trim().toUpperCase() : "DIARIO";
        return switch (freq) {
            case "SEMANAL", "WEEKLY" -> date.plusWeeks(direction);
            case "QUINCENAL", "BIWEEKLY" -> date.plusDays(15L * direction);
            case "MENSUAL", "MONTHLY" -> date.plusMonths(direction);
            case "FECHA_FIJA", "FECHA FIJA", "FIXED_DATE" -> date;
            default -> {
                LocalDate next = date.plusDays(direction);
                if (excludeSundays && next.getDayOfWeek() == DayOfWeek.SUNDAY) {
                    next = next.plusDays(direction);
                }
                yield next;
            }
        };
    }

    private static int findAnchorInstallmentNumber(int installmentCount, Set<Integer> paidInstallmentNumbers) {
        Set<Integer> paid = paidInstallmentNumbers != null ? paidInstallmentNumbers : Collections.emptySet();
        for (int i = 1; i <= installmentCount; i++) {
            if (!paid.contains(i)) {
                return i;
            }
        }
        return installmentCount;
    }

    /**
     * Simula el plan de cuotas de una migración de cartulina física anclado al "Día de pago"
     * de la próxima cuota pendiente. Las cuotas ya pagadas se proyectan hacia atrás y las futuras hacia adelante.
     */
    public List<InstallmentPlanItem> simulateAnchoredMigrationPlan(
            BigDecimal totalAgreed,
            int installmentCount,
            String frequency,
            LocalDate nextDueDate,
            Set<Integer> paidInstallmentNumbers
    ) {
        Objects.requireNonNull(totalAgreed, "totalAgreed no puede ser nulo");
        Objects.requireNonNull(nextDueDate, "nextDueDate no puede ser nulo");
        if (installmentCount <= 0) {
            throw new IllegalArgumentException("La cantidad de cuotas debe ser mayor a cero.");
        }
        if (isFixedDateFrequency(frequency)) {
            return simulatePlan(totalAgreed, 1, frequency, nextDueDate);
        }

        boolean excludeSundays = isExcludeSundaysEnabled();
        int anchorNum = findAnchorInstallmentNumber(installmentCount, paidInstallmentNumbers);
        LocalDate[] dueDates = new LocalDate[installmentCount];
        dueDates[anchorNum - 1] = nextDueDate;

        String freq = frequency != null ? frequency.trim().toUpperCase() : "DIARIO";
        if ("MENSUAL".equals(freq) || "MONTHLY".equals(freq)) {
            for (int i = 1; i <= installmentCount; i++) {
                if (i == anchorNum) continue;
                dueDates[i - 1] = nextDueDate.plusMonths(i - anchorNum);
            }
        } else {
            LocalDate back = nextDueDate;
            for (int i = anchorNum - 1; i >= 1; i--) {
                back = stepDate(back, freq, -1, excludeSundays);
                dueDates[i - 1] = back;
            }
            LocalDate fwd = nextDueDate;
            for (int i = anchorNum + 1; i <= installmentCount; i++) {
                fwd = stepDate(fwd, freq, 1, excludeSundays);
                dueDates[i - 1] = fwd;
            }
        }

        BigDecimal exactTotal = new Money(totalAgreed).amount();
        BigDecimal regularAmount = exactTotal.divide(BigDecimal.valueOf(installmentCount), 0, RoundingMode.DOWN);
        BigDecimal sumCalculated = BigDecimal.ZERO;
        List<InstallmentPlanItem> items = new ArrayList<>(installmentCount);
        for (int i = 1; i <= installmentCount; i++) {
            BigDecimal cuota = (i == installmentCount) ? exactTotal.subtract(sumCalculated) : regularAmount;
            if (i < installmentCount) {
                sumCalculated = sumCalculated.add(cuota);
            }
            items.add(new InstallmentPlanItem(i, dueDates[i - 1], cuota));
        }
        return items;
    }

    /** Deriva la fecha de inicio real del contrato (1 periodo antes de la cuota #1) a partir del Día de pago. */
    public LocalDate computeAnchoredStartDate(
            LocalDate nextDueDate,
            int installmentCount,
            String frequency,
            Set<Integer> paidInstallmentNumbers
    ) {
        if (nextDueDate == null) return LocalDate.now();
        if (isFixedDateFrequency(frequency)) return nextDueDate;
        boolean excludeSundays = isExcludeSundaysEnabled();
        int anchorNum = findAnchorInstallmentNumber(installmentCount, paidInstallmentNumbers);
        String freq = frequency != null ? frequency.trim().toUpperCase() : "DIARIO";
        if ("MENSUAL".equals(freq) || "MONTHLY".equals(freq)) {
            return nextDueDate.minusMonths(anchorNum);
        }
        LocalDate cursor = nextDueDate;
        for (int i = 0; i < anchorNum; i++) {
            cursor = stepDate(cursor, freq, -1, excludeSundays);
        }
        return cursor;
    }

    private boolean isExcludeSundaysEnabled() {
        if (settingRepository == null) return true;
        return settingRepository.findById("exclude_sundays")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
    }

    public boolean isPaperworkEnabled() {
        if (settingRepository == null) return true;
        return settingRepository.findById("paperwork_enabled")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
    }

    public BigDecimal resolvePaperworkFee(BigDecimal principal, BigDecimal explicitFee) {
        if (!isPaperworkEnabled()) {
            return BigDecimal.ZERO;
        }
        if (explicitFee != null) {
            return explicitFee.max(BigDecimal.ZERO);
        }
        BigDecimal feeRate = BigDecimal.valueOf(5000);
        if (settingRepository != null) {
            var optRate = settingRepository.findById("paperwork_fee");
            if (optRate.isPresent()) {
                try {
                    BigDecimal parsed = com.cartera.ui.util.CurrencyInputUtil.parseAmount(optRate.get().getSettingValue());
                    if (parsed != null && parsed.compareTo(BigDecimal.ZERO) >= 0) {
                        feeRate = parsed;
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
            case "FECHA_FIJA", "FECHA FIJA", "FIXED_DATE" -> date;
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
        var actor = access.collector(cmd.collectorId());
        if (!actor.userId().equals(cmd.authorUserId())) throw new SecurityException("El autor debe ser el usuario autenticado.");
        if (actor.isCollector() && cmd.isMigration()) {
            throw new SecurityException("Solo un Administrador o Supervisor puede migrar cartulinas anteriores.");
        }
        if (actor.isCollector() && !cmd.isMigration() && settingRepository != null) {
            boolean allowNewLoans = settingRepository.findById("route_allow_new_loans")
                    .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                    .orElse(true);
            if (!allowNewLoans) {
                throw new SecurityException("La política de la oficina no permite a los cobradores crear préstamos nuevos.");
            }
        }
        access.requireOpen(cmd.routeId(), cmd.collectorId(), LocalDate.now());

        if (cmd.customerId() == null || cmd.customerId().isBlank()) {
            throw new IllegalArgumentException("Debe seleccionar un cliente.");
        }
        var customer = customerRepository.findById(cmd.customerId())
                .orElseThrow(() -> new IllegalArgumentException("El cliente seleccionado no existe."));
        if ("INACTIVO".equalsIgnoreCase(customer.getStatus()) || "INACTIVE".equalsIgnoreCase(customer.getStatus())) {
            throw new IllegalStateException("No se puede otorgar un préstamo a un cliente INACTIVO. Reactívelo primero.");
        }
        if (cmd.principal() == null || cmd.principal().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto principal de capital debe ser mayor a cero.");
        }
        if (!cmd.isMigration() && settingRepository != null) {
            settingRepository.findById("max_new_loan_amount").ifPresent(s -> {
                try {
                    BigDecimal max = com.cartera.ui.util.CurrencyInputUtil.parseAmount(s.getSettingValue());
                    if (max != null && max.compareTo(BigDecimal.ZERO) > 0 && cmd.principal().compareTo(max) > 0) {
                        throw new IllegalArgumentException("El capital solicitado supera el monto máximo permitido para préstamos nuevos ($" + max.toPlainString() + ").");
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

        if (rate.signum() < 0 || (cmd.interestRate() != null &&
                new Money(cmd.principal().multiply(BigDecimal.ONE.add(rate))).amount().compareTo(cmd.totalAgreed()) != 0)) {
            throw new IllegalArgumentException("El total pactado debe coincidir con capital más el interés total del plazo.");
        }
        Set<Integer> paidNumbers = cmd.paidInstallmentNumbers() != null ? cmd.paidInstallmentNumbers() : Collections.emptySet();
        boolean useAnchoredMigration = cmd.isMigration() && cmd.nextDueDate() != null && !isFixedDateFrequency(cmd.frequency());
        List<InstallmentPlanItem> plan = useAnchoredMigration
                ? simulateAnchoredMigrationPlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.nextDueDate(), paidNumbers)
                : simulatePlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.startDate());
        LocalDate effectiveStartDate = useAnchoredMigration
                ? computeAnchoredStartDate(cmd.nextDueDate(), cmd.installmentCount(), cmd.frequency(), paidNumbers)
                : cmd.startDate();
        LocalDate endDate = plan.get(plan.size() - 1).dueDate();

        String routeId = (cmd.routeId() != null && !cmd.routeId().isBlank()) ? cmd.routeId().trim() : null;

        String opType = cmd.isMigration() ? "MIGRACION" : "NUEVO";

        // 1. Guardar Préstamo
        LoanEntity loan = new LoanEntity(
                loanId,
                cmd.customerId(),
                routeId,
                cmd.collectorId() != null && !cmd.collectorId().isBlank() ? cmd.collectorId().trim() : null,
                null,
                opType,
                cmd.principal(),
                rate,
                interestAmount,
                cmd.totalAgreed(),
                cmd.installmentCount(),
                cmd.frequency() != null ? cmd.frequency().toUpperCase() : "DIARIO",
                effectiveStartDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                endDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                "ACTIVO",
                nowTime
        );
        loanRepository.save(loan);

        // 2. Guardar Cuotas (saldando las cuotas pagadas en la cartulina física si es migración)
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
