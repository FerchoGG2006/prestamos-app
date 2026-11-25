package com.cartera.settlement.application;

import com.cartera.payments.domain.PaymentMethods;

import com.cartera.infrastructure.security.FinancialAccess;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.CollectionSessionEntity;
import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CollectionSessionRepository;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
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
    public static final String KEY_OPENING_BASE_PREFIX = "opening_base::";
    public static final String KEY_OPENING_BASE_META_PREFIX = "opening_base_meta::";

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
    private final com.cartera.infrastructure.persistence.repository.RouteRepository routeRepository;
    private final FinancialAccess access;
    private final LoanRepository loanRepository;
    private SystemSettingRepository settingRepository;

    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository,
            CashMovementRepository cashMovementRepository,
            AppUserRepository userRepository,
            DatabaseBackupService databaseBackupService,
            com.cartera.infrastructure.persistence.repository.RouteRepository routeRepository,
            FinancialAccess access
    ) {
        this(sessionRepository, settlementRepository, paymentRepository, auditLogRepository,
                cashMovementRepository, userRepository, databaseBackupService, routeRepository, access, null, null);
    }

    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository,
            CashMovementRepository cashMovementRepository,
            AppUserRepository userRepository,
            DatabaseBackupService databaseBackupService,
            com.cartera.infrastructure.persistence.repository.RouteRepository routeRepository,
            FinancialAccess access,
            LoanRepository loanRepository
    ) {
        this(sessionRepository, settlementRepository, paymentRepository, auditLogRepository,
                cashMovementRepository, userRepository, databaseBackupService, routeRepository, access, loanRepository, null);
    }

    @Autowired
    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository,
            CashMovementRepository cashMovementRepository,
            AppUserRepository userRepository,
            DatabaseBackupService databaseBackupService,
            com.cartera.infrastructure.persistence.repository.RouteRepository routeRepository,
            FinancialAccess access,
            LoanRepository loanRepository,
            @Autowired(required = false) SystemSettingRepository settingRepository
    ) {
        this.access = access;
        this.routeRepository = routeRepository;
        this.sessionRepository = sessionRepository;
        this.settlementRepository = settlementRepository;
        this.paymentRepository = paymentRepository;
        this.auditLogRepository = auditLogRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.userRepository = userRepository;
        this.databaseBackupService = databaseBackupService;
        this.loanRepository = loanRepository;
        this.settingRepository = settingRepository;
    }

    private BigDecimal cashCollected(List<PaymentEntity> payments) {
        return payments.stream().filter(p -> PaymentMethods.isCash(p.getMethod()))
                .map(PaymentEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String resolveRoute(String collector) {
        var activeRoutes = routeRepository.findAll().stream()
                .filter(r -> Integer.valueOf(1).equals(r.getActive()))
                .sorted(java.util.Comparator.comparing(r -> r.getId()))
                .toList();
        var collectorRoutes = activeRoutes.stream()
                .filter(r -> collector != null && collector.equals(r.getCollectorId()))
                .toList();
        String selected = com.cartera.infrastructure.security.UserSessionContext.getSelectedRouteId();
        if (selected != null && collectorRoutes.stream().anyMatch(r -> r.getId().equals(selected))) {
            return selected;
        }
        if (!collectorRoutes.isEmpty()) {
            return collectorRoutes.getFirst().getId();
        }
        // Managers may collect directly; resolve from their recorded loan payments.
        var payment = paymentRepository.findAll().stream()
                .filter(p -> collector != null && collector.equals(p.getCollectorId()))
                .findFirst();
        if (payment.isPresent()) {
            var movement = cashMovementRepository.findAll().stream()
                    .filter(m -> payment.get().getId().equals(m.getReferenceId()) && m.getRouteId() != null)
                    .findFirst();
            if (movement.isPresent() && routeRepository.existsById(movement.get().getRouteId())) {
                return movement.get().getRouteId();
            }
        }
        if (selected != null && !"ALL".equalsIgnoreCase(selected) && !"NONE".equalsIgnoreCase(selected)
                && activeRoutes.stream().anyMatch(r -> r.getId().equals(selected))) {
            return selected;
        }
        if (!activeRoutes.isEmpty()) {
            return activeRoutes.getFirst().getId();
        }
        throw new IllegalStateException("No hay ruta activa configurada en esta oficina.");
    }

    private String resolveExistingRouteId(String requestedRouteId, String collectorId) {
        if (requestedRouteId != null && !requestedRouteId.isBlank()) {
            String trimmed = requestedRouteId.trim();
            if (routeRepository.existsById(trimmed)) {
                return trimmed;
            }
            if ("route-1".equalsIgnoreCase(trimmed) && routeRepository.existsById("route-norte")) {
                return "route-norte";
            }
        }
        if (collectorId != null && !collectorId.isBlank()) {
            var owned = routeRepository.findAll().stream()
                    .filter(r -> collectorId.equals(r.getCollectorId()) && Integer.valueOf(1).equals(r.getActive()))
                    .map(r -> r.getId())
                    .findFirst();
            if (owned.isPresent()) return owned.get();
        }
        return routeRepository.findAll().stream()
                .filter(r -> Integer.valueOf(1).equals(r.getActive()))
                .map(r -> r.getId())
                .findFirst()
                .orElse(null);
    }

    public String getBackupWarning() { return databaseBackupService == null ? "Servicio de respaldo no disponible" : databaseBackupService.getLastFailure(); }

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
        if (routeId == null || routeId.isBlank()) {
            return "";
        }
        return routeId.trim();
    }

    private static boolean isValidPaymentStatus(String status) {
        return "APLICADO".equalsIgnoreCase(status) || "REGISTRADO".equalsIgnoreCase(status);
    }

    private static boolean isOutflowMovement(String movementType) {
        return "EGRESO".equalsIgnoreCase(movementType) || "SALIDA".equalsIgnoreCase(movementType);
    }

    private static boolean isCapitalInjectionCategory(String category) {
        if (category == null) return false;
        String cat = category.toUpperCase().trim();
        return "CAPITAL_INJECTION".equals(cat)
                || "INYECCION_CAPITAL".equals(cat)
                || "BASE_INICIAL".equals(cat)
                || "FONDEO_BASE".equals(cat)
                || "APORTE_CAPITAL".equals(cat)
                || "FONDEO_RUTA".equals(cat);
    }

    /**
     * Resuelve el ID de ruta activa para el cobrador indicado (o ruta seleccionada).
     */
    public String resolveRouteIdForCollector(String collectorId) {
        return normalizeRouteId(resolveRoute(collectorId));
    }

    /**
     * Lee la Base de Inicio guardada manualmente (o sincronizada desde Móvil) para `<routeId>::<YYYY-MM-DD>`.
     */
    public Optional<BigDecimal> getSavedOpeningRouteBase(String routeId, LocalDate date) {
        if (settingRepository == null || routeId == null || routeId.isBlank() || date == null) {
            return Optional.empty();
        }
        String key = KEY_OPENING_BASE_PREFIX + normalizeRouteId(routeId) + "::" + date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        return settingRepository.findById(key)
                .map(s -> s.getSettingValue())
                .filter(v -> v != null && !v.isBlank())
                .map(v -> {
                    try {
                        BigDecimal bd = new BigDecimal(v.trim());
                        return bd.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : bd;
                    } catch (Exception ex) {
                        return null;
                    }
                });
    }

    /**
     * Persiste una Base de Inicio diaria sincronizable con Móvil (`offices.settings.dailyOpeningBaseByRouteDate`).
     */
    @Transactional
    public void saveOpeningRouteBase(String routeId, LocalDate date, BigDecimal amount) {
        if (settingRepository == null || routeId == null || routeId.isBlank() || date == null) {
            return;
        }
        BigDecimal clean = (amount == null || amount.compareTo(BigDecimal.ZERO) < 0)
                ? BigDecimal.ZERO
                : amount.setScale(0, java.math.RoundingMode.HALF_UP);
        String suffix = normalizeRouteId(routeId) + "::" + date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String nowIso = java.time.Instant.now().toString();
        settingRepository.save(new com.cartera.infrastructure.persistence.entity.SystemSettingEntity(
                KEY_OPENING_BASE_PREFIX + suffix, clean.toPlainString(), nowIso));
        settingRepository.save(new com.cartera.infrastructure.persistence.entity.SystemSettingEntity(
                KEY_OPENING_BASE_META_PREFIX + suffix, nowIso, nowIso));
    }

    /**
     * Elimina el valor manual de Base de Inicio para volver al cálculo automático.
     */
    @Transactional
    public void clearSavedOpeningRouteBase(String routeId, LocalDate date) {
        if (settingRepository == null || routeId == null || routeId.isBlank() || date == null) {
            return;
        }
        String suffix = normalizeRouteId(routeId) + "::" + date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        settingRepository.findById(KEY_OPENING_BASE_PREFIX + suffix).ifPresent(settingRepository::delete);
        settingRepository.findById(KEY_OPENING_BASE_META_PREFIX + suffix).ifPresent(settingRepository::delete);
    }

    /**
     * Resuelve la Base de Inicio efectiva para una ruta/fecha:
     * si existe una base guardada (local o sincronizada con Móvil), tiene prioridad;
     * de lo contrario calcula automáticamente según arrastre histórico.
     */
    public BigDecimal resolveOpeningRouteBase(String collectorId, LocalDate date) {
        if (collectorId == null || collectorId.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            String routeId = normalizeRouteId(resolveRoute(collectorId));
            Optional<BigDecimal> saved = getSavedOpeningRouteBase(routeId, date);
            if (saved.isPresent()) {
                return saved.get();
            }
        } catch (Exception ignored) {
            // Caer al cálculo automático o propagar si no hay ruta en computeAutomaticOpeningRouteBase
        }
        return computeAutomaticOpeningRouteBase(collectorId, date);
    }

    /**
     * Calcula automáticamente la Base de inicio de ruta (SOLO efectivo base operativo,
     * dejando la papelería estrictamente aparte) con base en el cierre de días anteriores
     * más inyecciones de capital registradas hoy.
     */
    public BigDecimal computeAutomaticOpeningRouteBase(String collectorId, LocalDate date) {
        if (collectorId == null || collectorId.isBlank()) {
            return BigDecimal.ZERO;
        }
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String targetRoute;
        try {
            targetRoute = normalizeRouteId(resolveRoute(collectorId));
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
        if (targetRoute.isBlank()) {
            return BigDecimal.ZERO;
        }

        var paymentIndex = CashLedger.index(paymentRepository.findAll());
        java.util.Map<String, LoanEntity> loansById = (loanRepository != null)
                ? loanRepository.findAll().stream()
                        .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                        .collect(java.util.stream.Collectors.toMap(LoanEntity::getId, l -> l, (a, b) -> a))
                : java.util.Map.of();

        BigDecimal balance = BigDecimal.ZERO;
        for (var m : cashMovementRepository.findAll()) {
            if (!targetRoute.equalsIgnoreCase(normalizeRouteId(m.getRouteId()))) {
                continue;
            }
            String cat = m.getCategory() != null ? m.getCategory().toUpperCase().trim() : "";
            if ("RETIRO_PAPELERIA".equals(cat) || CAT_DESCUENTO_NOMINA.equals(cat)) {
                continue;
            }
            boolean physical;
            try {
                physical = CashLedger.isPhysical(m, paymentIndex);
            } catch (Exception ex) {
                continue;
            }
            if (!physical) {
                continue;
            }
            String movDate = (m.getCreatedAt() != null && m.getCreatedAt().length() >= 10)
                    ? m.getCreatedAt().substring(0, 10)
                    : "";
            boolean isBeforeDay = !movDate.isEmpty() && movDate.compareTo(dateStr) < 0;
            boolean isTodayInjection = movDate.equals(dateStr) && isCapitalInjectionCategory(cat);
            if (!isBeforeDay && !isTodayInjection) {
                continue;
            }

            BigDecimal amt = m.getAmount() != null ? m.getAmount() : BigDecimal.ZERO;
            if ("INGRESO".equalsIgnoreCase(m.getMovementType()) || "ENTRADA".equalsIgnoreCase(m.getMovementType())) {
                balance = balance.add(amt);
            } else if (isOutflowMovement(m.getMovementType())) {
                balance = balance.subtract(amt);
                // En desembolso de crédito nuevo no anulado, Desktop registra el neto (principal - papelería);
                // restar la papelería retenida para que la base de inicio sea SOLO efectivo base.
                if (("DESEMBOLSO".equals(cat) || "DESEMBOLSO_CREDITO".equals(cat) || "LOAN_DISBURSEMENT".equals(cat))
                        && m.getReferenceId() != null) {
                    LoanEntity loan = loansById.get(m.getReferenceId());
                    if (loan != null && loan.getPrincipal() != null && loan.getPrincipal().compareTo(amt) > 0) {
                        balance = balance.subtract(loan.getPrincipal().subtract(amt));
                    }
                }
            }
        }

        return balance.compareTo(BigDecimal.ZERO) > 0 ? balance : BigDecimal.ZERO;
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
            List<CashMovementEntity> routeExpensesList,
            BigDecimal collectedInCash,
            BigDecimal collectedDigitally,
            BigDecimal openingRouteBase,
            BigDecimal collectedPlusBase
    ) {
        public DaySettlementSummary(
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
                List<CashMovementEntity> routeExpensesList,
                BigDecimal collectedInCash,
                BigDecimal collectedDigitally
        ) {
            this(sessionId, sessionDate, collectorId, collectorName, totalCollected, routeExpenses,
                    netExpectedCash, expectedQuota, isClosed, settlement, routeExpensesList,
                    collectedInCash, collectedDigitally, BigDecimal.ZERO,
                    collectedInCash != null ? collectedInCash : BigDecimal.ZERO);
        }

        public BigDecimal expectedAmount() {
            return netExpectedCash;
        }
    }

    /** Consulta de solo lectura (sin crear filas en SQLite al navegar fechas o editar base en pantalla). */
    @Transactional(readOnly = true)
    public DaySettlementSummary previewDaySummary(String collectorId, LocalDate date, BigDecimal openingRouteBase) {
        return buildDaySummary(collectorId, date, openingRouteBase, false);
    }

    @Transactional
    public DaySettlementSummary getOrCreateDaySummary(String collectorId, LocalDate date) {
        return getOrCreateDaySummary(collectorId, date, BigDecimal.ZERO);
    }

    @Transactional
    public DaySettlementSummary getOrCreateDaySummary(String collectorId, LocalDate date, BigDecimal openingRouteBase) {
        return buildDaySummary(collectorId, date, openingRouteBase, true);
    }

    private DaySettlementSummary buildDaySummary(String collectorId, LocalDate date, BigDecimal openingRouteBase, boolean createSessionIfMissing) {
        if (collectorId == null || collectorId.isBlank()) {
            throw new IllegalArgumentException("Seleccione un cobrador válido.");
        }
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String collector = collectorId.trim();
        BigDecimal safeOpeningBase = (openingRouteBase != null && openingRouteBase.compareTo(BigDecimal.ZERO) > 0)
                ? openingRouteBase
                : BigDecimal.ZERO;

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

        // Obtener gastos operativos de la ruta registrados en la fecha para este cobrador
        List<CashMovementEntity> routeExpensesList = cashMovementRepository.findAll().stream()
                .filter(m -> isOutflowMovement(m.getMovementType()))
                .filter(m -> collector.equalsIgnoreCase(m.getCollectorId()))
                .filter(m -> m.getCreatedAt() != null && m.getCreatedAt().startsWith(dateStr))
                .filter(m -> isRouteExpenseCategory(m.getCategory()))
                .toList();

        BigDecimal routeExpenses = routeExpensesList.stream()
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal collectedCash = cashCollected(payments);
        BigDecimal collectedPlusBase = collectedCash.add(safeOpeningBase);
        BigDecimal netExpectedCash = collectedPlusBase.subtract(routeExpenses);
        if (netExpectedCash.compareTo(BigDecimal.ZERO) < 0) {
            netExpectedCash = BigDecimal.ZERO;
        }

        Optional<CollectionSessionEntity> existingSession = sessionRepository.findAll().stream()
                .filter(s -> dateStr.equals(s.getSessionDate()) && collector.equalsIgnoreCase(s.getCollectorId()))
                .findFirst();

        CollectionSessionEntity session;
        if (existingSession.isPresent()) {
            session = existingSession.get();
        } else if (createSessionIfMissing) {
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            CollectionSessionEntity newSession = new CollectionSessionEntity(
                    UUID.randomUUID().toString(),
                    resolveRoute(collector),
                    collector,
                    dateStr,
                    now,
                    null,
                    "ABIERTA",
                    totalCollected,
                    BigDecimal.ZERO,
                    "Jornada de cobro diaria"
            );
            session = sessionRepository.save(newSession);
        } else {
            // Vista previa sin escritura a BD (no crea filas collection_session fantasma)
            return new DaySettlementSummary(
                    null,
                    dateStr,
                    collector,
                    collectorName,
                    totalCollected,
                    routeExpenses,
                    netExpectedCash,
                    totalCollected,
                    false,
                    null,
                    routeExpensesList,
                    collectedCash,
                    totalCollected.subtract(collectedCash),
                    safeOpeningBase,
                    collectedPlusBase
            );
        }

        Optional<DailySettlementEntity> optSettlement = settlementRepository.findBySessionId(session.getId());
        boolean closed = optSettlement.isPresent()
                || "CERRADA".equalsIgnoreCase(session.getStatus())
                || "CERRADO".equalsIgnoreCase(session.getStatus());

        // Si el cierre ya es inmutable, respetar los montos persistidos del cierre en vez de recalcular en vivo
        BigDecimal displayExpectedCash = (closed && optSettlement.isPresent() && optSettlement.get().getExpectedCollection() != null)
                ? optSettlement.get().getExpectedCollection()
                : netExpectedCash;
        BigDecimal displayCollectedPlusBase = (closed && optSettlement.isPresent() && optSettlement.get().getExpectedCollection() != null)
                ? optSettlement.get().getExpectedCollection().add(routeExpenses)
                : collectedPlusBase;
        BigDecimal displayOpeningBase = (closed && optSettlement.isPresent() && optSettlement.get().getExpectedCollection() != null)
                ? displayCollectedPlusBase.subtract(collectedCash).max(BigDecimal.ZERO)
                : safeOpeningBase;

        return new DaySettlementSummary(
                session.getId(),
                dateStr,
                collector,
                collectorName,
                totalCollected,
                routeExpenses,
                displayExpectedCash,
                session.getExpectedCollection() != null ? session.getExpectedCollection() : totalCollected,
                closed,
                optSettlement.orElse(null),
                routeExpensesList,
                collectedCash,
                totalCollected.subtract(collectedCash),
                displayOpeningBase,
                displayCollectedPlusBase
        );
    }

    /**
     * Registra un gasto operativo propio de la ruta (pinchazo, datos celular, gasolina).
     * Soporta fecha de jornada explícita e idempotencia por movementId.
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
        return registerRouteExpense(collectorId, routeId, category, amount, description, authorUserId, LocalDate.now(), UUID.randomUUID().toString());
    }

    @Transactional
    public CashMovementEntity registerRouteExpense(
            String collectorId,
            String routeId,
            String category,
            BigDecimal amount,
            String description,
            String authorUserId,
            LocalDate expenseDate,
            String movementId
    ) {
        var actor = access.collector(collectorId);
        if (actor.isCollector() && settingRepository != null) {
            boolean allowExpenses = settingRepository.findById("route_allow_expenses")
                    .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                    .orElse(true);
            if (!allowExpenses) {
                throw new SecurityException("La política de la oficina no permite a los cobradores registrar gastos de ruta.");
            }
        }
        String effectiveId = (movementId != null && !movementId.isBlank()) ? movementId.trim() : UUID.randomUUID().toString();
        Optional<CashMovementEntity> existing = cashMovementRepository.findById(effectiveId);
        if (existing.isPresent()) {
            return existing.get();
        }

        LocalDate targetDate = expenseDate != null ? expenseDate : LocalDate.now();
        String route = resolveExistingRouteId(routeId, collectorId);
        access.requireOpen(route, collectorId, targetDate);
        if (!isRouteExpenseCategory(category)) throw new IllegalArgumentException("Categoría de gasto operativo inválida.");
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto del gasto operativo debe ser mayor a cero.");
        }
        com.cartera.domain.money.Money exactAmount = new com.cartera.domain.money.Money(amount);
        if (exactAmount.amount().compareTo(amount) != 0) {
            throw new IllegalArgumentException("Ingrese el monto del gasto en pesos enteros sin centavos.");
        }

        DaySettlementSummary summary = getOrCreateDaySummary(collectorId, targetDate);

        if (summary.isClosed()) {
            throw new IllegalStateException("No se pueden registrar gastos operativos en una liquidación que ya se encuentra en estado CERRADO.");
        }

        String cat = (category != null && !category.isBlank()) ? category : CAT_GASTO_OTRO;
        String desc = (description != null && !description.isBlank()) ? description.trim() : "Gasto operativo de ruta";
        String nowTime = targetDate.equals(LocalDate.now())
                ? LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                : targetDate.format(DateTimeFormatter.ISO_LOCAL_DATE) + "T12:00:00";

        CashMovementEntity movement = new CashMovementEntity(
                effectiveId,
                route,
                collectorId,
                summary.sessionId(),
                "EGRESO",
                cat,
                exactAmount.amount(),
                summary.sessionId(),
                desc,
                nowTime
        );
        CashMovementEntity saved = cashMovementRepository.save(movement);

        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                actor.userId(),
                "CASH_MOVEMENT",
                saved.getId(),
                "REGISTRO_GASTO_RUTA",
                null,
                "Gasto de ruta " + cat + ": " + CURRENCY.format(exactAmount.amount()) + " (" + desc + ")",
                "Gasto operativo cargado a la ruta del " + targetDate,
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
        return closeSettlement(sessionId, actualDelivered, BigDecimal.ZERO, payrollDeductionAmount, payrollDeductionReason, justification, authorUserId);
    }

    @Transactional
    public DailySettlementEntity closeSettlement(
            String sessionId,
            BigDecimal actualDelivered,
            BigDecimal openingRouteBase,
            BigDecimal payrollDeductionAmount,
            String payrollDeductionReason,
            String justification,
            String authorUserId
    ) {
        return closeSettlement(sessionId, actualDelivered, openingRouteBase, BigDecimal.ZERO,
                payrollDeductionAmount, payrollDeductionReason, justification, authorUserId);
    }

    @Transactional
    public DailySettlementEntity closeSettlement(
            String sessionId,
            BigDecimal actualDelivered,
            BigDecimal openingRouteBase,
            BigDecimal withdrawToOfficeAmount,
            BigDecimal payrollDeductionAmount,
            String payrollDeductionReason,
            String justification,
            String authorUserId
    ) {
        var actor = access.manager();
        if (actualDelivered == null || actualDelivered.signum() < 0
                || (openingRouteBase != null && openingRouteBase.signum() < 0)
                || (withdrawToOfficeAmount != null && withdrawToOfficeAmount.signum() < 0)
                || (payrollDeductionAmount != null && payrollDeductionAmount.signum() < 0))
            throw new IllegalArgumentException("Los valores de liquidación no pueden ser negativos.");
        BigDecimal safeOpeningBase = openingRouteBase != null ? openingRouteBase : BigDecimal.ZERO;
        BigDecimal safeWithdrawToOffice = withdrawToOfficeAmount != null ? withdrawToOfficeAmount : BigDecimal.ZERO;
        BigDecimal safePayroll = payrollDeductionAmount != null ? payrollDeductionAmount : BigDecimal.ZERO;
        if (new com.cartera.domain.money.Money(actualDelivered).amount().compareTo(actualDelivered) != 0
                || new com.cartera.domain.money.Money(safeOpeningBase).amount().compareTo(safeOpeningBase) != 0
                || new com.cartera.domain.money.Money(safeWithdrawToOffice).amount().compareTo(safeWithdrawToOffice) != 0
                || new com.cartera.domain.money.Money(safePayroll).amount().compareTo(safePayroll) != 0) {
            throw new IllegalArgumentException("Todos los montos de liquidación deben ingresarse en pesos enteros sin centavos.");
        }
        if (safeWithdrawToOffice.compareTo(actualDelivered) > 0) {
            throw new IllegalArgumentException("El retiro a oficina no puede superar el efectivo disponible/entregado en la liquidación ($ " + actualDelivered.toPlainString() + ").");
        }
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

        BigDecimal collectedCash = cashCollected(payments);
        BigDecimal collectedPlusBase = collectedCash.add(safeOpeningBase);
        BigDecimal netExpectedCash = collectedPlusBase.subtract(totalExpenses);
        if (netExpectedCash.compareTo(BigDecimal.ZERO) < 0) {
            netExpectedCash = BigDecimal.ZERO;
        }

        BigDecimal difference = actualDelivered.subtract(netExpectedCash);
        boolean hasPayrollReason = safePayroll.compareTo(BigDecimal.ZERO) > 0
                && payrollDeductionReason != null && !payrollDeductionReason.isBlank();
        if (difference.compareTo(BigDecimal.ZERO) != 0 && (justification == null || justification.isBlank()) && !hasPayrollReason) {
            throw new IllegalArgumentException("Debe ingresar una justificación obligatoria cuando existe descuadre de efectivo.");
        }

        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        StringBuilder fullJustification = new StringBuilder();
        if (safeOpeningBase.compareTo(BigDecimal.ZERO) > 0) {
            fullJustification.append("Base inicio ruta: ").append(CURRENCY.format(safeOpeningBase))
                    .append(" | Cobrado+Base: ").append(CURRENCY.format(collectedPlusBase));
        }
        if (safeWithdrawToOffice.compareTo(BigDecimal.ZERO) > 0) {
            if (fullJustification.length() > 0) {
                fullJustification.append(" | ");
            }
            fullJustification.append("Retiro a oficina: ").append(CURRENCY.format(safeWithdrawToOffice));
        }
        if (justification != null && !justification.isBlank()) {
            if (fullJustification.length() > 0) {
                fullJustification.append(" | ");
            }
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
                    resolveExistingRouteId(session.getRouteId(), collectorId),
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
                    actor.userId(),
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

        // Si el administrador eligió retirar efectivo a oficina central al cerrar, registrar el egreso en la fecha liquidada
        if (safeWithdrawToOffice.compareTo(BigDecimal.ZERO) > 0) {
            CashMovementEntity withdrawMovement = new CashMovementEntity(
                    UUID.randomUUID().toString(),
                    resolveExistingRouteId(session.getRouteId(), collectorId),
                    actor.userId(),
                    sessionId,
                    "EGRESO",
                    "RECAUDO_OFICINA",
                    safeWithdrawToOffice,
                    settlement.getId(),
                    "Retiro a oficina al cierre de liquidación (" + sessionDate + ")",
                    sessionDate + "T23:59:00"
            );
            cashMovementRepository.save(withdrawMovement);

            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    actor.userId(),
                    "CASH_MOVEMENT",
                    withdrawMovement.getId(),
                    "RETIRO_OFICINA_CIERRE",
                    null,
                    "Retiro a oficina al cierre: " + CURRENCY.format(safeWithdrawToOffice),
                    "Destino del efectivo base al cerrar liquidación diaria",
                    nowTime
            ));
        }

        // Actualizar sesión
        session.setStatus("CERRADA");
        session.setClosedAt(nowTime);
        session.setActualCollection(actualDelivered);
        sessionRepository.save(session);

        // Auditoría
        String user = actor.userId();
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                user,
                "DAILY_SETTLEMENT",
                settlement.getId(),
                "LIQUIDACION_DIARIA_CERRADA",
                null,
                "Cobrado: " + CURRENCY.format(totalCollected) + " | Base Inicio: " + CURRENCY.format(safeOpeningBase) +
                        " | Cobrado+Base: " + CURRENCY.format(collectedPlusBase) + " | Gastos Ruta: " + CURRENCY.format(totalExpenses) +
                        " | Neto Esperado: " + CURRENCY.format(netExpectedCash) + " | Entregado: " + CURRENCY.format(actualDelivered) +
                        " | Dif: " + CURRENCY.format(difference),
                "Cierre inmutable de liquidación diaria autorizada",
                nowTime
        ));

        if (databaseBackupService != null) {
            databaseBackupService.createAfterCommit("Backup automático por cierre de liquidación (" + sessionDate + ")");
        }

        return settlement;
    }

    @Transactional
    public DailySettlementEntity closeSettlement(String sessionId, BigDecimal actualDelivered, String justification, String authorUserId) {
        return closeSettlement(sessionId, actualDelivered, BigDecimal.ZERO, null, justification, authorUserId);
    }
}
