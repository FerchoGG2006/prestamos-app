package com.cartera.renewals.application;

import com.cartera.infrastructure.security.FinancialAccess;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.domain.money.Money;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.renewals.domain.RenewalCalculator;
import com.cartera.renewals.domain.RenewalCalculator.RenewalQuote;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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

    private final FinancialAccess access;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final RenewalRepository renewalRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;
    private final CreateLoanUseCase createLoanUseCase;
    private final TodayCollectionsService collectionsService;
    private final AppUserRepository userRepository;
    private final CollectionSessionRepository sessionRepository;

    public RenewLoanUseCase(LoanRepository loanRepository,
                            InstallmentRepository installmentRepository,
                            RenewalRepository renewalRepository,
                            CashMovementRepository cashMovementRepository,
                            AuditLogRepository auditLogRepository,
                            CreateLoanUseCase createLoanUseCase,
                            TodayCollectionsService collectionsService,
                            AppUserRepository userRepository,
                            CollectionSessionRepository sessionRepository, FinancialAccess access) {
        this.access = access;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.renewalRepository = renewalRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.collectionsService = collectionsService;
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
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
            String authorUserId,
            RenewalPreview expectedPreview
    ) {
        public RenewLoanCommand(String previousLoanId, BigDecimal newPrincipal, BigDecimal interestRate,
                                BigDecimal totalAgreed, int installmentCount, String frequency,
                                LocalDate startDate, BigDecimal paperworkFee, String authorUserId) {
            this(previousLoanId, newPrincipal, interestRate, totalAgreed, installmentCount,
                    frequency, startDate, paperworkFee, authorUserId, null);
        }

        public RenewLoanCommand withPreview(RenewalPreview preview) {
            return new RenewLoanCommand(previousLoanId, newPrincipal, interestRate, totalAgreed,
                    installmentCount, frequency, startDate, paperworkFee, authorUserId, preview);
        }
    }

    public record RenewalPreview(String routeId, RenewalQuote quote) { }

    @Transactional(readOnly = true)
    public RenewalPreview preview(RenewLoanCommand cmd) {
        var loan = requireLoan(cmd);
        authorize(cmd, loan);
        return calculatePreview(cmd, loan);
    }

    private LoanEntity requireLoan(RenewLoanCommand cmd) {
        Objects.requireNonNull(cmd, "El comando no puede ser nulo");
        return loanRepository.findById(Objects.requireNonNull(cmd.previousLoanId()))
                .orElseThrow(() -> new IllegalArgumentException("No se encontró el crédito anterior."));
    }

    private void authorize(RenewLoanCommand cmd, LoanEntity loan) {
        var session = UserSessionContext.requireSession();
        var user = userRepository.findById(session.userId())
                .orElseThrow(() -> new IllegalStateException("Usuario no registrado."));
        if (!Integer.valueOf(1).equals(user.getActive()) || !session.userId().equals(cmd.authorUserId())) {
            throw new IllegalStateException("El autor debe ser el usuario activo autenticado.");
        }
        if (!(session.isAdmin() || session.isSupervisor()
                || (session.isCollector() && session.userId().equals(loan.getCollectorId())))) {
            throw new IllegalStateException("No tiene permiso para renovar este crédito.");
        }
    }

    private RenewalPreview calculatePreview(RenewLoanCommand cmd, LoanEntity loan) {
        if (!"ACTIVO".equalsIgnoreCase(loan.getStatus())) {
            throw new IllegalStateException("Solo se pueden renovar créditos en estado ACTIVO.");
        }
        String normalizedFreq = cmd.frequency() == null ? "" : cmd.frequency().trim().toUpperCase();
        if ("FECHA_FIJA".equals(normalizedFreq) || "FIXED_DATE".equals(normalizedFreq)) {
            normalizedFreq = "FECHA FIJA";
        }
        if (cmd.installmentCount() < 1 || cmd.startDate() == null
                || !List.of("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "FECHA FIJA").contains(normalizedFreq)) {
            throw new IllegalArgumentException("Revise cuotas, modalidad y fecha de inicio.");
        }
        var principal = new Money(cmd.newPrincipal());
        BigDecimal requestedPaperwork = cmd.paperworkFee() == null ? BigDecimal.ZERO : cmd.paperworkFee();
        if (!createLoanUseCase.isPaperworkEnabled()) {
            requestedPaperwork = BigDecimal.ZERO;
        }
        var paperwork = new Money(requestedPaperwork);
        if (principal.amount().compareTo(cmd.newPrincipal()) != 0
                || (cmd.paperworkFee() != null && createLoanUseCase.isPaperworkEnabled()
                && paperwork.amount().compareTo(cmd.paperworkFee()) != 0)) {
            throw new IllegalArgumentException("Ingrese los montos en pesos enteros.");
        }
        String route = TodayCollectionsService.normalizeRouteId(loan.getRouteId());
        access.requireOpen(route, loan.getCollectorId(), LocalDate.now());
        BigDecimal balance = installmentRepository.findByLoanId(loan.getId()).stream()
                .map(InstallmentEntity::getPendingAmount)
                .filter(b -> b != null && b.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add);
        var metrics = collectionsService.getDailyMetricsForRoute(LocalDate.now(), route);
        var quote = RenewalCalculator.quote(principal, exactMoney(balance, "Saldo anterior"), paperwork,
                cmd.interestRate(), exactMoney(metrics.cashBalance(), "Base"), exactMoney(metrics.totalActiveDebt(), "Cartera"), exactMoney(metrics.digitalBalance(), "Fondos digitales"));
        if (cmd.totalAgreed() == null || quote.totalAgreed().amount().compareTo(cmd.totalAgreed()) != 0) {
            throw new IllegalArgumentException("El total pactado debe ser capital más el interés total del plazo.");
        }
        return new RenewalPreview(route, quote);
    }

    private Money exactMoney(BigDecimal value, String label) {
        var money = new Money(value);
        if (money.amount().compareTo(value) != 0) {
            throw new IllegalStateException(label + " contiene fracciones de peso. Requiere revisión antes de renovar; no se redondeará el saldo.");
        }
        return money;
    }

    public record RenewalResult(
            String newLoanId,
            BigDecimal previousBalanceDeducted,
            BigDecimal cashDisbursed,
            BigDecimal totalAgreed
    ) {}

    @Transactional
    public RenewalResult execute(RenewLoanCommand cmd) {
        LoanEntity previousLoan = requireLoan(cmd);
        authorize(cmd, previousLoan);
        var existing = renewalRepository.findByPreviousLoanId(previousLoan.getId());
        if (existing.isPresent()) {
            var saved = existing.get();
            var next = loanRepository.findById(saved.getNewLoanId()).orElseThrow();
            if (saved.getNewPrincipal().compareTo(cmd.newPrincipal()) != 0
                    || saved.getPaperworkDeducted().compareTo(cmd.paperworkFee() == null ? BigDecimal.ZERO : cmd.paperworkFee()) != 0
                    || next.getInterestRate().compareTo(cmd.interestRate()) != 0
                    || next.getTotalAgreed().compareTo(cmd.totalAgreed()) != 0
                    || next.getInstallmentCount() != cmd.installmentCount()
                    || !next.getFrequency().equals(cmd.frequency())
                    || !next.getStartDate().equals(cmd.startDate().toString())) {
                throw new IllegalStateException("Este crédito ya fue renovado con otras condiciones.");
            }
            return new RenewalResult(saved.getNewLoanId(), saved.getPreviousBalanceDeducted(),
                    saved.getActualCashDisbursed(), next.getTotalAgreed());
        }

        var preview = calculatePreview(cmd, previousLoan);
        if (cmd.expectedPreview() != null && !cmd.expectedPreview().equals(preview)) {
            throw new IllegalStateException("Los saldos cambiaron. Revise el resumen actualizado antes de confirmar.");
        }

        if (!"ACTIVO".equalsIgnoreCase(previousLoan.getStatus())) {
            throw new IllegalStateException("Solo se pueden renovar créditos en estado ACTIVO.");
        }

        // Calcular saldo restante de TODAS las cuotas no pagadas (PENDIENTE, PARCIAL, VENCIDA)
        List<InstallmentEntity> previousInstallments = installmentRepository.findByLoanId(cmd.previousLoanId());
        BigDecimal previousBalance = previousInstallments.stream()
                .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal paperwork = preview.quote().paperworkDeducted().amount();
        BigDecimal cashToDisburse = preview.quote().actualCashDisbursed().amount();

        if (cashToDisburse.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("El nuevo capital ($" + cmd.newPrincipal() + ") no alcanza para cubrir el saldo pendiente ($" + previousBalance + ") y papelería ($" + paperwork + ").");
        }

        String newLoanId = UUID.randomUUID().toString();
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        String userId = cmd.authorUserId();
        String routeId = preview.routeId();

        // 1. Marcar crédito anterior como RENOVADO y cerrar todas sus cuotas pendientes
        previousLoan.setStatus("RENOVADO");
        loanRepository.save(previousLoan);

        for (InstallmentEntity inst : previousInstallments) {
            if (inst.getPendingAmount() != null && inst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0
                    || !"PAGADA".equalsIgnoreCase(inst.getStatus())) {
                inst.setPaidAmount(inst.getAmount());
                inst.setStatus("PAGADA");
                installmentRepository.save(inst);
            }
        }

        // 2. Crear nuevo crédito
        var plan = createLoanUseCase.simulatePlan(cmd.totalAgreed(), cmd.installmentCount(), cmd.frequency(), cmd.startDate());
        LocalDate endDate = plan.get(plan.size() - 1).dueDate();

        LoanEntity newLoan = new LoanEntity(
                newLoanId,
                previousLoan.getCustomerId(),
                routeId,
                previousLoan.getCollectorId(),
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
                    routeId,
                    previousLoan.getCollectorId(),
                    null,
                    "EGRESO",
                    "DESEMBOLSO_RENOVACION",
                    cashToDisburse,
                    newLoanId,
                    "Desembolso neto por renovación crédito anterior ID: " + previousLoan.getId(),
                    nowTime
            ));
        }

        if (paperwork.signum() > 0) {
            cashMovementRepository.save(new CashMovementEntity(
                    UUID.randomUUID().toString(), routeId, previousLoan.getCollectorId(), null,
                    "EGRESO", "PAPELERIA_RENOVACION", paperwork, newLoanId,
                    "Salida de Base operativa por papelería de renovación; autor: " + userId, nowTime));
        }

        // 6. Auditoría
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                userId,
                "RENEWAL",
                renewalId,
                "RENOVACION_CREDITO",
                "Crédito anterior: " + previousLoan.getId() + " Saldo: " + previousBalance
                        + " Base: " + preview.quote().cashBefore().amount()
                        + " Cartera: " + preview.quote().debtBefore().amount()
                        + " Administrativo: " + preview.quote().administrativeBefore().amount(),
                "Nuevo crédito: " + newLoanId + " Capital: " + cmd.newPrincipal() + " Papelería: " + paperwork
                        + " Desembolso neto: " + cashToDisburse + " Interés: " + preview.quote().interest().amount()
                        + " Base: " + preview.quote().cashAfter().amount()
                        + " Cartera: " + preview.quote().debtAfter().amount()
                        + " Administrativo: " + preview.quote().administrativeAfter().amount(),
                "Renovación y reestructuración de crédito",
                nowTime
        ));

        return new RenewalResult(newLoanId, previousBalance, cashToDisburse, cmd.totalAgreed());
    }
}
