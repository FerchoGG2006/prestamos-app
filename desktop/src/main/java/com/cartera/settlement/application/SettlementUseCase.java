package com.cartera.settlement.application;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.CollectionSessionEntity;
import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CollectionSessionRepository;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Caso de uso para liquidación y cuadre inmutable de jornadas de cobro diario.
 * Distingue financieramente:
 * - Gastos Operativos de la Ruta (se descuentan del efectivo que la ruta rinde a la caja).
 * - Descuadres Personales / Faltantes (se imputan para descuento de nómina al cobrador).
 */
@Service
public class SettlementUseCase {

    public static final String CAT_GASTO_PINCHAZO = "GASTO_RUTA_PINCHAZO";
    public static final String CAT_GASTO_DATOS = "GASTO_RUTA_DATOS";
    public static final String CAT_GASTO_GASOLINA = "GASTO_RUTA_GASOLINA";
    public static final String CAT_GASTO_OTRO = "GASTO_RUTA_OTRO";
    public static final String CAT_DESCUENTO_NOMINA = "DESCUENTO_NOMINA_DESCUADRE";

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final CollectionSessionRepository sessionRepository;
    private final DailySettlementRepository settlementRepository;
    private final PaymentRepository paymentRepository;
    private final AuditLogRepository auditLogRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AppUserRepository userRepository;
    private final DatabaseBackupService databaseBackupService;

    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository,
            CashMovementRepository cashMovementRepository,
            AppUserRepository userRepository
    ) {
        this(sessionRepository, settlementRepository, paymentRepository, auditLogRepository, cashMovementRepository, userRepository, null);
    }

    @Autowired
    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository,
            CashMovementRepository cashMovementRepository,
            AppUserRepository userRepository,
            DatabaseBackupService databaseBackupService
    ) {
        this.sessionRepository = sessionRepository;
        this.settlementRepository = settlementRepository;
        this.paymentRepository = paymentRepository;
        this.auditLogRepository = auditLogRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.userRepository = userRepository;
        this.databaseBackupService = databaseBackupService;
    }

    public static boolean isRouteExpenseCategory(String category) {
        if (category == null) return false;
        String cat = category.toUpperCase().trim();
        return cat.startsWith("GASTO_RUTA")
                || cat.contains("PINCHAZO")
                || cat.contains("DATOS")
                || cat.contains("GASOLINA")
                || cat.contains("VIATICOS")
                || "EXPENSE".equals(cat)
                || "GASTO_OPERATIVO".equals(cat);
    }

    public static String normalizeRouteId(String routeId) {
        if (routeId == null || routeId.isBlank() || "route-1".equalsIgnoreCase(routeId.trim())) {
            return "route-norte";
        }
        return routeId.trim();
    }

    private static boolean isValidPaymentStatus(String status) {
        return "APLICADO".equalsIgnoreCase(status) || "REGISTRADO".equalsIgnoreCase(status);
    }

    private static boolean isOutflowMovement(String movementType) {
        return "EGRESO".equalsIgnoreCase(movementType) || "SALIDA".equalsIgnoreCase(movementType);
    }

    public record DaySettlementSummary(
            String sessionId,
            String sessionDate,
            String collectorId,
            String collectorName,
            BigDecimal totalCollected,
            BigDecimal routeExpenses,
            BigDecimal netExpectedCash,
            BigDecimal expectedQuota,
            boolean isClosed,
            DailySettlementEntity settlement,
            List<CashMovementEntity> routeExpensesList
    ) {
        public BigDecimal expectedAmount() {
            return netExpectedCash;
        }
    }

    @Transactional
    public DaySettlementSummary getOrCreateDaySummary(String collectorId, LocalDate date) {
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String collector = (collectorId != null && !collectorId.isBlank()) ? collectorId : "usr-col-1";

        String collectorName = userRepository.findById(collector)
                .map(u -> u.getFullName() != null ? u.getFullName() : u.getUsername())
                .orElse(collector);

        List<PaymentEntity> payments = paymentRepository.findAll().stream()
                .filter(p -> isValidPaymentStatus(p.getStatus()))
                .filter(p -> p.getCreatedAt() != null && p.getCreatedAt().startsWith(dateStr))
                .filter(p -> collector.equalsIgnoreCase(p.getCollectorId()))
                .toList();

        BigDecimal totalCollected = payments.stream()
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Obtener gastos operativos de la ruta registrados hoy para este cobrador
        List<CashMovementEntity> routeExpensesList = cashMovementRepository.findAll().stream()
                .filter(m -> isOutflowMovement(m.getMovementType()))
                .filter(m -> collector.equalsIgnoreCase(m.getCollectorId()))
                .filter(m -> m.getCreatedAt() != null && m.getCreatedAt().startsWith(dateStr))
                .filter(m -> isRouteExpenseCategory(m.getCategory()))
                .toList();

        BigDecimal routeExpenses = routeExpensesList.stream()
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal netExpectedCash = totalCollected.subtract(routeExpenses);
        if (netExpectedCash.compareTo(BigDecimal.ZERO) < 0) {
            netExpectedCash = BigDecimal.ZERO;
        }

        // Buscar sesión del día o crear una activa
        CollectionSessionEntity session = sessionRepository.findAll().stream()
                .filter(s -> dateStr.equals(s.getSessionDate()) && collector.equalsIgnoreCase(s.getCollectorId()))
                .findFirst()
                .orElseGet(() -> {
                    String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                    CollectionSessionEntity newSession = new CollectionSessionEntity(
                            UUID.randomUUID().toString(),
                            "route-norte",
                            collector,
                            dateStr,
                            now,
                            null,
                            "ABIERTA",
                            totalCollected,
                            BigDecimal.ZERO,
                            "Jornada de cobro diaria"
                    );
                    return sessionRepository.save(newSession);
                });

        Optional<DailySettlementEntity> optSettlement = settlementRepository.findBySessionId(session.getId());
        boolean closed = optSettlement.isPresent()
                || "CERRADA".equalsIgnoreCase(session.getStatus())
                || "CERRADO".equalsIgnoreCase(session.getStatus());

        return new DaySettlementSummary(
                session.getId(),
                dateStr,
                collector,
                collectorName,
                totalCollected,
                routeExpenses,
                netExpectedCash,
                session.getExpectedCollection() != null ? session.getExpectedCollection() : totalCollected,
                closed,
                optSettlement.orElse(null),
                routeExpensesList
        );
    }

    /**
     * Registra un gasto operativo propio de la ruta (pinchazo, datos celular, gasolina).
     * Este gasto disminuye el efectivo que el cobrador rinde a la caja de la oficina.
     */
    @Transactional
    public CashMovementEntity registerRouteExpense(
            String collectorId,
            String routeId,
            String category,
            BigDecimal amount,
            String description,
            String authorUserId
    ) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto del gasto operativo debe ser mayor a cero.");
        }

        LocalDate today = LocalDate.now();
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        DaySettlementSummary summary = getOrCreateDaySummary(collectorId, today);

        if (summary.isClosed()) {
            throw new IllegalStateException("No se pueden registrar gastos operativos en una liquidación que ya se encuentra en estado CERRADO.");
        }

        String cat = (category != null && !category.isBlank()) ? category : CAT_GASTO_OTRO;
        String desc = (description != null && !description.isBlank()) ? description : "Gasto operativo de ruta";
        String route = normalizeRouteId(routeId);

        CashMovementEntity movement = new CashMovementEntity(
                UUID.randomUUID().toString(),
                route,
                collectorId,
                summary.sessionId(),
                "EGRESO",
                cat,
                amount,
                summary.sessionId(),
                desc,
                nowTime
        );
        CashMovementEntity saved = cashMovementRepository.save(movement);

        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                authorUserId != null ? authorUserId : collectorId,
                "CASH_MOVEMENT",
                saved.getId(),
                "REGISTRO_GASTO_RUTA",
                null,
                "Gasto de ruta " + cat + ": " + CURRENCY.format(amount) + " (" + desc + ")",
                "Gasto operativo cargado a la ruta del día",
                nowTime
        ));

        return saved;
    }

    /**
     * Cierra de forma inmutable y autorizada la liquidación diaria del cobrador.
     * Si hubo faltante o consumo personal, permite imputar el monto para Descuento de Nómina.
     * Además, dispara automáticamente una copia de seguridad silenciosa de cartera.db.
     */
    @Transactional
    public DailySettlementEntity closeSettlement(
            String sessionId,
            BigDecimal actualDelivered,
            BigDecimal payrollDeductionAmount,
            String payrollDeductionReason,
            String justification,
            String authorUserId
    ) {
        CollectionSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("No se encontró la sesión de cobranza con ID: " + sessionId));

        if (settlementRepository.findBySessionId(sessionId).isPresent()
                || "CERRADA".equalsIgnoreCase(session.getStatus())
                || "CERRADO".equalsIgnoreCase(session.getStatus())) {
            throw new IllegalStateException("Esta jornada de cobro ya fue liquidada y cerrada previamente. Los cierres son inmutables.");
        }

        String sessionDate = session.getSessionDate();
        String collectorId = session.getCollectorId();

        // Calcular gastos operativos de la ruta de esta sesión
        List<CashMovementEntity> routeExpenses = cashMovementRepository.findAll().stream()
                .filter(m -> sessionId.equals(m.getSessionId())
                        || (collectorId.equalsIgnoreCase(m.getCollectorId()) && m.getCreatedAt() != null && m.getCreatedAt().startsWith(sessionDate)))
                .filter(m -> isOutflowMovement(m.getMovementType()))
                .filter(m -> isRouteExpenseCategory(m.getCategory()))
                .toList();

        BigDecimal totalExpenses = routeExpenses.stream()
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Recaudado en sistema por cuotas
        List<PaymentEntity> payments = paymentRepository.findAll().stream()
                .filter(p -> isValidPaymentStatus(p.getStatus()))
                .filter(p -> p.getCreatedAt() != null && p.getCreatedAt().startsWith(sessionDate))
                .filter(p -> collectorId.equalsIgnoreCase(p.getCollectorId()))
                .toList();

        BigDecimal totalCollected = payments.stream()
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal netExpectedCash = totalCollected.subtract(totalExpenses);
        if (netExpectedCash.compareTo(BigDecimal.ZERO) < 0) {
            netExpectedCash = BigDecimal.ZERO;
        }

        BigDecimal difference = actualDelivered.subtract(netExpectedCash);
        if (difference.compareTo(BigDecimal.ZERO) != 0 && (justification == null || justification.isBlank())) {
            throw new IllegalArgumentException("Debe ingresar una justificación obligatoria cuando existe descuadre de efectivo.");
        }

        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        StringBuilder fullJustification = new StringBuilder();
        if (justification != null && !justification.isBlank()) {
            fullJustification.append(justification.trim());
        }

        // Si se indicó deducción a nómina por descuadre/consumo personal
        if (payrollDeductionAmount != null && payrollDeductionAmount.compareTo(BigDecimal.ZERO) > 0) {
            String reason = payrollDeductionReason != null && !payrollDeductionReason.isBlank()
                    ? payrollDeductionReason.trim()
                    : "Consumo personal cobrador / descuadre del día";

            if (fullJustification.length() > 0) {
                fullJustification.append(" | ");
            }
            fullJustification.append("DEDUCCIÓN NÓMINA: ")
                    .append(CURRENCY.format(payrollDeductionAmount))
                    .append(" (").append(reason).append(")");

            CashMovementEntity payrollMovement = new CashMovementEntity(
                    UUID.randomUUID().toString(),
                    normalizeRouteId(session.getRouteId()),
                    collectorId,
                    sessionId,
                    "EGRESO",
                    CAT_DESCUENTO_NOMINA,
                    payrollDeductionAmount,
                    sessionId,
                    "Descuento nómina por descuadre/consumo personal: " + reason,
                    nowTime
            );
            cashMovementRepository.save(payrollMovement);

            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    authorUserId != null ? authorUserId : "admin",
                    "PAYROLL_DEDUCTION",
                    payrollMovement.getId(),
                    "IMPUTACION_DESCUENTO_NOMINA",
                    null,
                    "Monto: " + CURRENCY.format(payrollDeductionAmount) + " a nómina de " + collectorId,
                    reason,
                    nowTime
            ));
        }

        DailySettlementEntity settlement = new DailySettlementEntity(
                UUID.randomUUID().toString(),
                sessionId,
                netExpectedCash,
                actualDelivered,
                difference,
                fullJustification.toString(),
                "CERRADO",
                nowTime
        );
        settlementRepository.save(settlement);

        // Actualizar sesión
        session.setStatus("CERRADA");
        session.setClosedAt(nowTime);
        session.setActualCollection(actualDelivered);
        sessionRepository.save(session);

        // Auditoría
        String user = authorUserId != null ? authorUserId : "admin";
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                user,
                "DAILY_SETTLEMENT",
                settlement.getId(),
                "LIQUIDACION_DIARIA_CERRADA",
                null,
                "Cobrado: " + CURRENCY.format(totalCollected) + " | Gastos Ruta: " + CURRENCY.format(totalExpenses) +
                        " | Neto Esperado: " + CURRENCY.format(netExpectedCash) + " | Entregado: " + CURRENCY.format(actualDelivered) +
                        " | Dif: " + CURRENCY.format(difference),
                "Cierre inmutable de liquidación diaria autorizada",
                nowTime
        ));

        // Backup automático silencioso tras cierre de liquidación diaria
        if (databaseBackupService != null) {
            try {
                databaseBackupService.createBackup("Backup automático por cierre de liquidación de ruta (" + sessionDate + ")");
            } catch (Exception ignored) {
                // No abortar la transacción si el backup en disco falla
            }
        }

        return settlement;
    }

    @Transactional
    public DailySettlementEntity closeSettlement(String sessionId, BigDecimal actualDelivered, String justification, String authorUserId) {
        return closeSettlement(sessionId, actualDelivered, BigDecimal.ZERO, null, justification, authorUserId);
    }
}
