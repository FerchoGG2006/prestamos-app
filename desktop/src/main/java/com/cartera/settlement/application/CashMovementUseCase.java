package com.cartera.settlement.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.Set;

/**
 * Registro manual de movimientos de caja por ruta (ingresos de base, retiros a oficina, ajustes).
 * Garantías financieras (AGENTS.md):
 * - Transaccional: el movimiento y su registro de auditoría se guardan juntos o no se guarda nada.
 * - Autorizado: requiere sesión activa y rol de Administrador o Supervisor.
 * - Idempotente: el identificador lo genera el formulario una sola vez; reintentos no duplican.
 * - Por ruta: nunca se registra sobre el consolidado "Todas las rutas".
 */
@Service
public class CashMovementUseCase {

    public static final String TYPE_INFLOW = "INGRESO";
    public static final String TYPE_OUTFLOW = "EGRESO";
    private static final Set<String> VALID_TYPES = Set.of(TYPE_INFLOW, TYPE_OUTFLOW);

    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;

    public CashMovementUseCase(CashMovementRepository cashMovementRepository, AuditLogRepository auditLogRepository) {
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
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

    /** Saldo disponible en caja de una ruta específica, o del consolidado si routeId es null / "ALL". */
    @Transactional(readOnly = true)
    public BigDecimal availableBalance(String routeId) {
        boolean all = routeId == null || "ALL".equalsIgnoreCase(routeId);
        BigDecimal balance = BigDecimal.ZERO;
        for (CashMovementEntity m : cashMovementRepository.findAll()) {
            if (!all && !routeId.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(m.getRouteId()))) continue;
            if (isInflow(m.getMovementType())) balance = balance.add(m.getAmount());
            else if (isOutflow(m.getMovementType())) balance = balance.subtract(m.getAmount());
        }
        return balance;
    }

    @Transactional
    public CashMovementEntity register(CashMovementCommand cmd) {
        UserSession session = UserSessionContext.requireSession();
        if (session.isCollector()) {
            throw new SecurityException("Solo un Administrador o Supervisor puede registrar movimientos de caja.");
        }
        if (cmd.movementId() == null || cmd.movementId().isBlank()) {
            throw new IllegalArgumentException("Falta el identificador del movimiento.");
        }

        // Idempotencia: si ya existe, se devuelve el mismo movimiento sin duplicarlo.
        Optional<CashMovementEntity> existing = cashMovementRepository.findById(cmd.movementId());
        if (existing.isPresent()) {
            return existing.get();
        }

        if (cmd.routeId() == null || cmd.routeId().isBlank() || "ALL".equalsIgnoreCase(cmd.routeId())) {
            throw new IllegalArgumentException("Seleccione una ruta específica en la parte superior antes de registrar el movimiento.");
        }
        String type = cmd.movementType() == null ? "" : cmd.movementType().toUpperCase();
        if (!VALID_TYPES.contains(type)) {
            throw new IllegalArgumentException("Tipo de movimiento no válido.");
        }
        if (cmd.amount() == null || cmd.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero.");
        }
        if (cmd.description() == null || cmd.description().isBlank()) {
            throw new IllegalArgumentException("Escriba una descripción que justifique el movimiento.");
        }
        if (TYPE_OUTFLOW.equals(type)) {
            BigDecimal available = availableBalance(cmd.routeId());
            if (cmd.amount().compareTo(available) > 0) {
                throw new IllegalArgumentException("Saldo insuficiente en la caja de la ruta. Disponible: $ " + available.toPlainString());
            }
        }

        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        CashMovementEntity movement = new CashMovementEntity(
                cmd.movementId(),
                cmd.routeId(),
                session.userId(),
                null,
                type,
                cmd.category(),
                cmd.amount(),
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
                type + " " + cmd.amount().toPlainString() + " (" + cmd.category() + ") ruta " + cmd.routeId(),
                cmd.description().trim(),
                now
        ));
        return saved;
    }
}
