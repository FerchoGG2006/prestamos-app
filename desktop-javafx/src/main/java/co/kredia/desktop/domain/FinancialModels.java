package co.kredia.desktop.domain;

import java.math.BigDecimal;
import java.util.List;

/**
 * Modelos de dominio financiero para Kredia Desktop (JavaFX).
 * Cumple estrictamente las reglas de AGENTS.md:
 * - Todos los valores monetarios usan exclusivamente BigDecimal (jamas double o float).
 * - Payment se persiste separadamente de sus registros PaymentAllocation.
 * - Las liquidaciones cerradas (DailySettlementRecord) son inmutables.
 */
public final class FinancialModels {

    private FinancialModels() {}

    public enum UserRole {
        SUPER_ADMIN,
        ADMIN,
        SUPERVISOR,
        COBRADOR
    }

    public record CustomerRecord(
            String id,
            String fullName,
            String documentNumber,
            String phone,
            String address,
            String neighborhood,
            String routeId,
            int orderIndex,
            String createdAt
    ) {}

    public record LoanRecord(
            String id,
            String loanNumber,
            String customerId,
            String routeId,
            String collectorId,
            BigDecimal principal,
            BigDecimal interestRate,
            BigDecimal interestAmount,
            BigDecimal totalAgreed,
            int installmentCount,
            BigDecimal installmentAmount,
            BigDecimal paperworkFee,
            boolean isTacoMigration,
            String status,
            String startDate,
            String endDate,
            String notes,
            String createdAt
    ) {}

    public record InstallmentRecord(
            String id,
            String loanId,
            int installmentNumber,
            String dueDate,
            BigDecimal expectedAmount,
            BigDecimal paidAmount,
            BigDecimal pendingAmount,
            String status
    ) {}

    /**
     * Regla Financiera (AGENTS.md):
     * Persistir el pago (PaymentRecord) separadamente de sus asignaciones por cuota (PaymentAllocationRecord).
     */
    public record PaymentRecord(
            String id,
            String idempotencyKey,
            String loanId,
            String customerId,
            String collectorId,
            String routeId,
            BigDecimal amountReceived,
            String paymentMethod,
            String status,
            String notes,
            String createdAt
    ) {}

    public record PaymentAllocationRecord(
            String id,
            String paymentId,
            String loanId,
            String installmentId,
            int installmentNumber,
            BigDecimal amountApplied,
            String resultingStatus
    ) {}

    /**
     * Regla Financiera (AGENTS.md):
     * Los cierres de jornada (SETTLED) son inmutables; cualquier ajuste posterior se registra
     * mediante correcciones auditadas compensatorias sin editar ni borrar el cierre.
     */
    public record DailySettlementRecord(
            String id,
            String date,
            String routeId,
            String collectorId,
            BigDecimal expectedCollection,
            BigDecimal actualCollection,
            BigDecimal collectedCash,
            BigDecimal collectedTransfers,
            BigDecimal cashHandedOver,
            BigDecimal cashDifference,
            String differenceJustification,
            String status,
            String settledAt,
            String auditedBy
    ) {}

    public record AuditLogRecord(
            String id,
            String userId,
            String userRole,
            String timestamp,
            String entity,
            String entityId,
            String action,
            String previousValueJson,
            String newValueJson,
            String reason
    ) {}

    public record RouteMetricsSummary(
            BigDecimal totalAdministrativeCapital,
            BigDecimal activeCapitalInStreet,
            BigDecimal cashAvailableInHand,
            BigDecimal collectedToday,
            BigDecimal collectedCashToday,
            BigDecimal collectedDigitalToday,
            BigDecimal accumulatedPaperwork,
            BigDecimal overdueTotalAmount,
            int activeLoansCount,
            int overdueCustomersCount
    ) {}
}
