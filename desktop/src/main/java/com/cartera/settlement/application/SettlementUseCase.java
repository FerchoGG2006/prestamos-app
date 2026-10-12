package com.cartera.settlement.application;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CollectionSessionEntity;
import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CollectionSessionRepository;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Caso de uso para liquidación y cuadre inmutable de jornadas de cobro diario.
 */
@Service
public class SettlementUseCase {

    private final CollectionSessionRepository sessionRepository;
    private final DailySettlementRepository settlementRepository;
    private final PaymentRepository paymentRepository;
    private final AuditLogRepository auditLogRepository;

    public SettlementUseCase(
            CollectionSessionRepository sessionRepository,
            DailySettlementRepository settlementRepository,
            PaymentRepository paymentRepository,
            AuditLogRepository auditLogRepository
    ) {
        this.sessionRepository = sessionRepository;
        this.settlementRepository = settlementRepository;
        this.paymentRepository = paymentRepository;
        this.auditLogRepository = auditLogRepository;
    }

    public record DaySettlementSummary(
            String sessionId,
            String sessionDate,
            String collectorId,
            BigDecimal totalCollected,
            BigDecimal expectedAmount,
            boolean isClosed,
            DailySettlementEntity settlement
    ) {}

    @Transactional
    public DaySettlementSummary getOrCreateDaySummary(String collectorId, LocalDate date) {
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String collector = (collectorId != null && !collectorId.isBlank()) ? collectorId : "usr-col-1";

        List<PaymentEntity> payments = paymentRepository.findAll().stream()
                .filter(p -> "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .filter(p -> p.getCreatedAt().startsWith(dateStr))
                .filter(p -> collector.equalsIgnoreCase(p.getCollectorId()))
                .toList();

        BigDecimal totalCollected = payments.stream()
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

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
        boolean closed = optSettlement.isPresent() || "CERRADA".equalsIgnoreCase(session.getStatus());

        return new DaySettlementSummary(
                session.getId(),
                dateStr,
                collector,
                totalCollected,
                session.getExpectedCollection(),
                closed,
                optSettlement.orElse(null)
        );
    }

    @Transactional
    public DailySettlementEntity closeSettlement(String sessionId, BigDecimal actualDelivered, String justification, String authorUserId) {
        CollectionSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("No se encontró la sesión de cobranza con ID: " + sessionId));

        if (settlementRepository.findBySessionId(sessionId).isPresent()) {
            throw new IllegalStateException("Esta jornada de cobro ya fue liquidada y cerrada previamente. Los cierres son inmutables.");
        }

        BigDecimal expected = session.getExpectedCollection() != null ? session.getExpectedCollection() : BigDecimal.ZERO;
        BigDecimal difference = actualDelivered.subtract(expected);
        String nowTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        DailySettlementEntity settlement = new DailySettlementEntity(
                UUID.randomUUID().toString(),
                sessionId,
                expected,
                actualDelivered,
                difference,
                justification != null ? justification.trim() : "",
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
        String user = authorUserId != null ? authorUserId : session.getCollectorId();
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                user,
                "DAILY_SETTLEMENT",
                settlement.getId(),
                "LIQUIDACION_DIARIA_CERRADA",
                null,
                "Esperado: " + expected + " Entregado: " + actualDelivered + " Dif: " + difference,
                "Cierre inmutable de jornada de cobro",
                nowTime
        ));

        return settlement;
    }
}
