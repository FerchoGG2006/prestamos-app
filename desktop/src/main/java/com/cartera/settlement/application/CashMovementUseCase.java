package com.cartera.settlement.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.security.FinancialAccess;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Registro manual de movimientos de caja por ruta (ingresos de base, retiros a oficina, traslados, papelería y ajustes).
 * Garantías financieras (AGENTS.md):
 * - Transaccional: el movimiento y su registro de auditoría se guardan juntos o no se guarda nada.
 * - Autorizado: requiere sesión activa y rol de Administrador o Supervisor verificado.
 * - Idempotente: el identificador lo genera el formulario una sola vez; reintentos no duplican.
 * - Por ruta: nunca se registra sobre el consolidado "Todas las rutas" y respeta jornadas cerradas.
 */
@Service
public class CashMovementUseCase {

    public static final String TYPE_INFLOW = "INGRESO";
    public static final String TYPE_OUTFLOW = "EGRESO";
    private static final Set<String> VALID_TYPES = Set.of(TYPE_INFLOW, TYPE_OUTFLOW);

    private final PaymentRepository paymentRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;
    private final RouteRepository routeRepository;
    private final FinancialAccess access;
    private final TodayCollectionsService collectionsService;

    public CashMovementUseCase(CashMovementRepository cashMovementRepository,
                               AuditLogRepository auditLogRepository,
                               PaymentRepository paymentRepository) {
        this(cashMovementRepository, auditLogRepository, paymentRepository, null, null, null);
    }

    @Autowired
    public CashMovementUseCase(CashMovementRepository cashMovementRepository,
                               AuditLogRepository auditLogRepository,
                               PaymentRepository paymentRepository,
                               @Autowired(required = false) RouteRepository routeRepository,
                               @Autowired(required = false) FinancialAccess access,
                               @Autowired(required = false) TodayCollectionsService collectionsService) {
        this.paymentRepository = paymentRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.access = access;
        this.collectionsService = collectionsService;
    }

    public record CashMovementCommand(
            String movementId,
            String routeId,
            String movementType,
            String category,
            BigDecimal amount,
            String description,
            String auditAction
    ) {}

    public static boolean isInflow(String type) {
        return "INGRESO".equalsIgnoreCase(type) || "ENTRADA".equalsIgnoreCase(type);
    }

    public static boolean isOutflow(String type) {
        return "EGRESO".equalsIgnoreCase(type) || "SALIDA".equalsIgnoreCase(type);
    }

    /** Saldo operativo disponible en caja de una ruta específica, o del consolidado si routeId es null / "ALL". */
    @Transactional(readOnly = true)
    public BigDecimal availableBalance(String routeId) {
        boolean all = routeId == null || "ALL".equalsIgnoreCase(routeId);
        BigDecimal balance = BigDecimal.ZERO;
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                if (!all && !routeId.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(r.getId()))) continue;
                BigDecimal base = r.getInitialCashBase();
                if (base != null && base.signum() > 0) {
                    balance = balance.add(base);
                }
            }
        }
        var payments = CashLedger.index(paymentRepository.findAll());
        for (CashMovementEntity m : cashMovementRepository.findAll()) {
            String cat = m.getCategory() != null ? m.getCategory().toUpperCase().trim() : "";
            if ("RETIRO_PAPELERIA".equals(cat) || "COBRO_HISTORICO".equals(cat) || "REVERSO_HISTORICO".equals(cat)) continue;
            if (!CashLedger.isPhysical(m, payments)) continue;
            if (!all && !routeId.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(m.getRouteId()))) continue;
            if (isInflow(m.getMovementType())) balance = balance.add(m.getAmount());
            else if (isOutflow(m.getMovementType())) balance = balance.subtract(m.getAmount());
        }
        return balance;
    }

    /** Saldo disponible de papelería retenida en caja (Spec 008). */
    @Transactional(readOnly = true)
    public BigDecimal paperworkAvailableBalance(String routeId) {
        if (collectionsService == null) {
            return BigDecimal.ZERO;
        }
        return collectionsService.getPaperworkAvailableBalance(routeId);
    }

    /** Lista indexada en O(N) de movimientos físicos de caja (elimina N+1 de paymentRepository.findAll()). */
    @Transactional(readOnly = true)
    public List<CashMovementEntity> listPhysicalMovements(String routeId) {
        boolean all = routeId == null || "ALL".equalsIgnoreCase(routeId);
        var payments = CashLedger.index(paymentRepository.findAll());
        return cashMovementRepository.findAll().stream()
                .filter(m -> all || routeId.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(m.getRouteId())))
                .filter(m -> {
                    try {
                        return CashLedger.isPhysical(m, payments);
                    } catch (Exception ex) {
                        return false;
                    }
                })
                .sorted(Comparator.comparing(CashMovementEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    public boolean isPhysical(CashMovementEntity movement) {
        return CashLedger.isPhysical(movement,
                CashLedger.index(paymentRepository.findAll()));
    }

    @Transactional
    public CashMovementEntity register(CashMovementCommand cmd) {
        UserSession session = requireManagerSession();
        if (cmd.movementId() == null || cmd.movementId().isBlank()) {
            throw new IllegalArgumentException("Falta el identificador del movimiento.");
        }

        // Idempotencia: si ya existe, se devuelve el mismo movimiento sin duplicarlo.
        Optional<CashMovementEntity> existing = cashMovementRepository.findById(cmd.movementId());
        if (existing.isPresent()) {
            return existing.get();
        }

        if (cmd.routeId() == null || cmd.routeId().isBlank() || "ALL".equalsIgnoreCase(cmd.routeId()) || "NONE".equalsIgnoreCase(cmd.routeId())) {
            throw new IllegalArgumentException("Seleccione una ruta específica en la parte superior antes de registrar el movimiento.");
        }
        RouteEntity routeEntity = requireValidRoute(cmd.routeId());
        String routeCollectorId = routeEntity != null ? routeEntity.getCollectorId() : null;
        if (access != null) {
            access.requireOpen(cmd.routeId(), routeCollectorId, LocalDate.now());
        }

        String type = cmd.movementType() == null ? "" : cmd.movementType().toUpperCase();
        if (!VALID_TYPES.contains(type)) {
            throw new IllegalArgumentException("Tipo de movimiento no válido.");
        }
        BigDecimal exactAmount = requirePositiveWholePesos(cmd.amount());
        if (cmd.description() == null || cmd.description().isBlank()) {
            throw new IllegalArgumentException("Escriba una descripción que justifique el movimiento.");
        }

        boolean isPaperworkWithdrawal = "RETIRO_PAPELERIA".equalsIgnoreCase(cmd.category());
        if (TYPE_OUTFLOW.equals(type)) {
            if (isPaperworkWithdrawal) {
                BigDecimal availablePaperwork = paperworkAvailableBalance(cmd.routeId());
                if (exactAmount.compareTo(availablePaperwork) > 0) {
                    throw new IllegalArgumentException("El monto supera la papelería disponible en esta ruta ($ " + availablePaperwork.toPlainString() + ").");
                }
            } else {
                BigDecimal available = availableBalance(cmd.routeId());
                if (exactAmount.compareTo(available) > 0) {
                    throw new IllegalArgumentException("Saldo insuficiente en la caja de la ruta. Disponible: $ " + available.toPlainString());
                }
            }
        }

        // Para gastos de ruta registrados desde Caja (gasolina/viáticos), atribuir al cobrador de la ruta para reflejarse en su liquidación
        String effectiveCollectorId = (SettlementUseCase.isRouteExpenseCategory(cmd.category()) && routeCollectorId != null && !routeCollectorId.isBlank())
                ? routeCollectorId
                : session.userId();

        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        CashMovementEntity movement = new CashMovementEntity(
                cmd.movementId(),
                cmd.routeId(),
                effectiveCollectorId,
                null,
                type,
                cmd.category(),
                exactAmount,
                null,
                cmd.description().trim(),
                now
        );
        CashMovementEntity saved = cashMovementRepository.save(movement);

        auditLogRepository.save(new AuditLogEntity(
                java.util.UUID.randomUUID().toString(),
                session.userId(),
                "CASH_MOVEMENT",
                saved.getId(),
                cmd.auditAction() != null ? cmd.auditAction() : "REGISTRO_MOVIMIENTO_CAJA",
                null,
                type + " " + exactAmount.toPlainString() + " (" + cmd.category() + ") ruta " + cmd.routeId(),
                cmd.description().trim(),
                now
        ));
        return saved;
    }

    /** Retiro auditable e idempotente de papelería disponible sin alterar el Patrimonio Administrativo (Spec 008). */
    @Transactional
    public CashMovementEntity withdrawPaperwork(String movementId, String routeId, BigDecimal amount, String notes) {
        String desc = (notes == null || notes.isBlank())
                ? "Retiro de papelería disponible en oficina"
                : "Retiro de papelería - " + notes.trim();
        return register(new CashMovementCommand(
                movementId,
                routeId,
                TYPE_OUTFLOW,
                "RETIRO_PAPELERIA",
                amount,
                desc,
                "RETIRO_PAPELERIA"
        ));
    }

    /** Traslado transaccional entre dos rutas (egreso origen + ingreso destino en la misma transacción). */
    @Transactional
    public List<CashMovementEntity> transferBetweenRoutes(
            String transferId,
            String sourceRouteId,
            String destinationRouteId,
            BigDecimal amount,
            String notes
    ) {
        UserSession session = requireManagerSession();
        if (transferId == null || transferId.isBlank()) {
            throw new IllegalArgumentException("Falta el identificador de traslado.");
        }
        String outId = transferId + "-OUT";
        String inId = transferId + "-IN";
        Optional<CashMovementEntity> existingOut = cashMovementRepository.findById(outId);
        Optional<CashMovementEntity> existingIn = cashMovementRepository.findById(inId);
        if (existingOut.isPresent() && existingIn.isPresent()) {
            return List.of(existingOut.get(), existingIn.get());
        }

        if (sourceRouteId == null || sourceRouteId.isBlank() || "ALL".equalsIgnoreCase(sourceRouteId)) {
            throw new IllegalArgumentException("Seleccione una ruta de origen válida.");
        }
        if (destinationRouteId == null || destinationRouteId.isBlank() || "ALL".equalsIgnoreCase(destinationRouteId)) {
            throw new IllegalArgumentException("Seleccione la ruta de destino del traslado.");
        }
        if (sourceRouteId.trim().equalsIgnoreCase(destinationRouteId.trim())) {
            throw new IllegalArgumentException("La ruta de destino debe ser distinta a la ruta de origen.");
        }

        RouteEntity srcRoute = requireValidRoute(sourceRouteId);
        RouteEntity dstRoute = requireValidRoute(destinationRouteId);
        if (access != null) {
            access.requireOpen(sourceRouteId, srcRoute != null ? srcRoute.getCollectorId() : null, LocalDate.now());
            access.requireOpen(destinationRouteId, dstRoute != null ? dstRoute.getCollectorId() : null, LocalDate.now());
        }

        BigDecimal exactAmount = requirePositiveWholePesos(amount);
        BigDecimal available = availableBalance(sourceRouteId);
        if (exactAmount.compareTo(available) > 0) {
            throw new IllegalArgumentException("Saldo insuficiente en la ruta origen. Disponible: $ " + available.toPlainString());
        }

        String srcName = srcRoute != null ? srcRoute.getName() : sourceRouteId;
        String dstName = dstRoute != null ? dstRoute.getName() : destinationRouteId;
        String noteSuffix = (notes == null || notes.isBlank()) ? "" : " - " + notes.trim();
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        CashMovementEntity outMove = cashMovementRepository.save(new CashMovementEntity(
                outId, sourceRouteId, session.userId(), null, TYPE_OUTFLOW, "TRASLADO_RUTA",
                exactAmount, inId, "Traslado hacia " + dstName + noteSuffix, now
        ));
        CashMovementEntity inMove = cashMovementRepository.save(new CashMovementEntity(
                inId, destinationRouteId, session.userId(), null, TYPE_INFLOW, "TRASLADO_RUTA",
                exactAmount, outId, "Traslado recibido desde " + srcName + noteSuffix, now
        ));

        auditLogRepository.save(new AuditLogEntity(
                java.util.UUID.randomUUID().toString(),
                session.userId(),
                "CASH_MOVEMENT",
                transferId,
                "TRASLADO_ENTRE_RUTAS",
                srcName,
                "Traslado $" + exactAmount.toPlainString() + " de " + srcName + " a " + dstName,
                notes == null || notes.isBlank() ? "Traslado interno entre rutas" : notes.trim(),
                now
        ));

        return List.of(outMove, inMove);
    }

    private UserSession requireManagerSession() {
        if (access != null) {
            return access.manager();
        }
        UserSession session = UserSessionContext.requireSession();
        if (!session.canReverseOrCancel()) {
            throw new SecurityException("Solo un Administrador o Supervisor puede registrar movimientos de caja.");
        }
        return session;
    }

    private RouteEntity requireValidRoute(String routeId) {
        if (routeRepository == null) {
            return null;
        }
        return routeRepository.findById(routeId)
                .orElseThrow(() -> new IllegalArgumentException("La ruta seleccionada (" + routeId + ") no existe."));
    }

    private static BigDecimal requirePositiveWholePesos(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero.");
        }
        Money whole = new Money(amount);
        if (whole.amount().compareTo(amount) != 0) {
            throw new IllegalArgumentException("Ingrese el monto en pesos enteros sin centavos.");
        }
        return whole.amount();
    }
}
