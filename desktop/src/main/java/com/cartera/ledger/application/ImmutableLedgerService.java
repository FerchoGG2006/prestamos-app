package com.cartera.ledger.application;

import com.cartera.infrastructure.persistence.entity.FinancialEventEntity;
import com.cartera.infrastructure.persistence.repository.FinancialEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Servicio del Libro Mayor Financiero Inmutable (patrón Datomic / Nubank append-only).
 * - Solo permite insertar hechos nuevos (con idempotencia por office_id + idempotency_key).
 * - Opera exclusivamente con BigDecimal.
 * - Deriva Cartera en Calle, Base en Efectivo, Recaudo Digital y Patrimonio Administrativo
 *   como suma exacta de los hechos inmutables registrados.
 */
@Service
public class ImmutableLedgerService {

    public record LedgerBalanceSnapshot(
            String officeId,
            String routeId,
            int eventsCount,
            BigDecimal portfolioBalance,
            BigDecimal cashBalance,
            BigDecimal digitalBalance,
            BigDecimal administrativeTotal
    ) {}

    public record AppendEventCommand(
            String officeId,
            String idempotencyKey,
            String eventType,
            String entityType,
            String entityId,
            String routeId,
            String customerId,
            String actorUserId,
            BigDecimal amount,
            BigDecimal cashDelta,
            BigDecimal digitalDelta,
            BigDecimal portfolioDelta,
            String payloadJson,
            String occurredAtIso
    ) {}

    private final FinancialEventRepository repository;

    public ImmutableLedgerService(FinancialEventRepository repository) {
        this.repository = repository;
    }

    /**
     * Inserta un hecho financiero inmutable de forma idempotente.
     * Si el (officeId, idempotencyKey) ya existe, retorna el hecho original sin duplicar.
     */
    @Transactional
    public FinancialEventEntity appendIdempotent(AppendEventCommand cmd) {
        if (cmd.officeId() == null || cmd.officeId().isBlank()) {
            throw new IllegalArgumentException("officeId es obligatorio para registrar un hecho financiero.");
        }
        if (cmd.idempotencyKey() == null || cmd.idempotencyKey().isBlank()) {
            throw new IllegalArgumentException("idempotencyKey es obligatorio.");
        }

        Optional<FinancialEventEntity> existing =
                repository.findByOfficeIdAndIdempotencyKey(cmd.officeId().trim(), cmd.idempotencyKey().trim());
        if (existing.isPresent()) {
            return existing.get();
        }

        String now = Instant.now().toString();
        FinancialEventEntity entity = new FinancialEventEntity(
                "evt-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                cmd.officeId().trim(),
                cmd.idempotencyKey().trim(),
                cmd.eventType(),
                cmd.entityType(),
                cmd.entityId(),
                cmd.routeId(),
                cmd.customerId(),
                cmd.actorUserId(),
                scale(cmd.amount()),
                scale(cmd.cashDelta()),
                scale(cmd.digitalDelta()),
                scale(cmd.portfolioDelta()),
                cmd.payloadJson() == null || cmd.payloadJson().isBlank() ? "{}" : cmd.payloadJson(),
                cmd.occurredAtIso() == null || cmd.occurredAtIso().isBlank() ? now : cmd.occurredAtIso(),
                now
        );
        return repository.save(entity);
    }

    /**
     * Proyección determinista de saldos desde los hechos inmutables de una oficina (o ruta).
     */
    @Transactional(readOnly = true)
    public LedgerBalanceSnapshot computeBalance(String officeId, String routeIdFilter) {
        List<FinancialEventEntity> events = (routeIdFilter == null || routeIdFilter.isBlank() || "ALL".equalsIgnoreCase(routeIdFilter))
                ? repository.findByOfficeIdOrderBySequenceNoAsc(officeId)
                : repository.findByOfficeIdAndRouteIdOrderBySequenceNoAsc(officeId, routeIdFilter);

        BigDecimal portfolio = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal cash = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal digital = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        for (FinancialEventEntity e : events) {
            portfolio = portfolio.add(new BigDecimal(e.getPortfolioDelta()));
            cash = cash.add(new BigDecimal(e.getCashDelta()));
            digital = digital.add(new BigDecimal(e.getDigitalDelta()));
        }

        BigDecimal administrative = portfolio.add(cash).add(digital);
        return new LedgerBalanceSnapshot(
                officeId,
                routeIdFilter == null ? "ALL" : routeIdFilter,
                events.size(),
                portfolio,
                cash,
                digital,
                administrative
        );
    }

    private static String scale(BigDecimal val) {
        return (val == null ? BigDecimal.ZERO : val).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
