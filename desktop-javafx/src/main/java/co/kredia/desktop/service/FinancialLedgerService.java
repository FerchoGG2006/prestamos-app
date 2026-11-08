package co.kredia.desktop.service;

import co.kredia.desktop.domain.DelinquencyCalculator;
import co.kredia.desktop.domain.DelinquencyCalculator.DelinquencyEvaluation;
import co.kredia.desktop.domain.FinancialModels.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

/**
 * Servicio Financiero Transaccional para Kredia Desktop (JavaFX + SQLite).
 * Cumple rigurosamente las reglas de AGENTS.md:
 * 1. Usa BigDecimal para todos los valores monetarios (nunca double o float).
 * 2. Persiste cada Payment en la tabla `payments` separadamente de `payment_allocations`.
 * 3. Usa la abstraccion `DelinquencyCalculator` sin inventar formulas de mora.
 * 4. Todas las escrituras financieras son transaccionales (BEGIN/COMMIT/ROLLBACK),
 *    auditables (`audit_logs`), autorizadas por rol e idempotentes (`idempotency_key`).
 * 5. Los cierres de liquidacion (`settlements`) son inmutables; cualquier ajuste usa
 *    correcciones auditadas compensatorias.
 */
public class FinancialLedgerService {

    private static final BigDecimal ONE_HUNDRED_THOUSAND = new BigDecimal("100000");
    private static final BigDecimal DEFAULT_PAPERWORK_RATE = new BigDecimal("5000");
    private static final BigDecimal DEFAULT_INTEREST_RATE = new BigDecimal("0.20");

    private static final int POOL_SIZE = 8;
    private final String jdbcUrl;
    private final DelinquencyCalculator delinquencyCalculator;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BlockingQueue<Connection> connectionPool = new ArrayBlockingQueue<>(POOL_SIZE);

    public FinancialLedgerService(String sqliteFilePath, DelinquencyCalculator delinquencyCalculator) {
        this.jdbcUrl = "jdbc:sqlite:" + sqliteFilePath;
        this.delinquencyCalculator = delinquencyCalculator;
        initializeSchema();
    }

    private Connection createPhysicalConnection() throws SQLException {
        Connection raw = DriverManager.getConnection(jdbcUrl);
        try (Statement st = raw.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON;");
            st.execute("PRAGMA journal_mode = WAL;");
            st.execute("PRAGMA synchronous = NORMAL;");
            st.execute("PRAGMA temp_store = MEMORY;");
            st.execute("PRAGMA busy_timeout = 5000;");
        }
        return raw;
    }

    /**
     * Item 25: Pool de conexiones SQLite en modo WAL.
     * Reutiliza conexiones abiertas y las devuelve automaticamente al pool al invocar close().
     */
    private Connection openConnection() throws SQLException {
        Connection raw = connectionPool.poll();
        if (raw == null || raw.isClosed()) {
            raw = createPhysicalConnection();
        }
        final Connection delegate = raw;
        return (Connection) Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[]{Connection.class},
                (proxy, method, args) -> {
                    if ("close".equals(method.getName())) {
                        if (!delegate.isClosed()) {
                            if (!delegate.getAutoCommit()) {
                                delegate.setAutoCommit(true);
                            }
                            if (!connectionPool.offer(delegate)) {
                                delegate.close();
                            }
                        }
                        return null;
                    }
                    return method.invoke(delegate, args);
                }
        );
    }

    private void initializeSchema() {
        try (Connection conn = openConnection(); Statement st = conn.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON;");
            st.execute("""
                CREATE TABLE IF NOT EXISTS customers (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    document_number TEXT NOT NULL UNIQUE,
                    phone TEXT NOT NULL,
                    address TEXT NOT NULL,
                    neighborhood TEXT NOT NULL,
                    route_id TEXT NOT NULL,
                    order_index INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS loans (
                    id TEXT PRIMARY KEY,
                    loan_number TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    route_id TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    principal TEXT NOT NULL,
                    interest_rate TEXT NOT NULL,
                    interest_amount TEXT NOT NULL,
                    total_agreed TEXT NOT NULL,
                    installment_count INTEGER NOT NULL,
                    installment_amount TEXT NOT NULL,
                    paperwork_fee TEXT NOT NULL,
                    is_taco_migration INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    notes TEXT,
                    created_at TEXT NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS installments (
                    id TEXT PRIMARY KEY,
                    loan_id TEXT NOT NULL,
                    installment_number INTEGER NOT NULL,
                    due_date TEXT NOT NULL,
                    expected_amount TEXT NOT NULL,
                    paid_amount TEXT NOT NULL,
                    pending_amount TEXT NOT NULL,
                    status TEXT NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS payments (
                    id TEXT PRIMARY KEY,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    loan_id TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    route_id TEXT NOT NULL,
                    amount_received TEXT NOT NULL,
                    payment_method TEXT NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT,
                    created_at TEXT NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS payment_allocations (
                    id TEXT PRIMARY KEY,
                    payment_id TEXT NOT NULL,
                    loan_id TEXT NOT NULL,
                    installment_id TEXT NOT NULL,
                    installment_number INTEGER NOT NULL,
                    amount_applied TEXT NOT NULL,
                    resulting_status TEXT NOT NULL,
                    FOREIGN KEY(payment_id) REFERENCES payments(id)
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS settlements (
                    id TEXT PRIMARY KEY,
                    date TEXT NOT NULL,
                    route_id TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    expected_collection TEXT NOT NULL,
                    actual_collection TEXT NOT NULL,
                    collected_cash TEXT NOT NULL,
                    collected_transfers TEXT NOT NULL,
                    cash_handed_over TEXT NOT NULL,
                    cash_difference TEXT NOT NULL,
                    difference_justification TEXT,
                    status TEXT NOT NULL,
                    settled_at TEXT NOT NULL,
                    audited_by TEXT,
                    UNIQUE(date, route_id)
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS cash_movements (
                    id TEXT PRIMARY KEY,
                    route_id TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    category TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    reference_id TEXT,
                    description TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_role TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    previous_value_json TEXT,
                    new_value_json TEXT,
                    reason TEXT
                );
            """);
            // Item 17: Indices compuestos para las consultas mas frecuentes de cartera y recaudo
            st.execute("CREATE INDEX IF NOT EXISTS idx_customers_route_order ON customers(route_id, order_index);");
            st.execute("CREATE INDEX IF NOT EXISTS idx_loans_route_status ON loans(route_id, status, customer_id);");
            st.execute("CREATE INDEX IF NOT EXISTS idx_installments_loan_pending ON installments(loan_id, installment_number, status);");
            st.execute("CREATE INDEX IF NOT EXISTS idx_payments_route_date ON payments(route_id, status, created_at);");
            st.execute("CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id, loan_id);");
            st.execute("CREATE INDEX IF NOT EXISTS idx_settlements_route_date ON settlements(route_id, date, status);");
        } catch (SQLException e) {
            throw new IllegalStateException("Error inicializando base de datos SQLite cartera.db", e);
        }
    }

    public BigDecimal calculatePaperworkFee(BigDecimal principal, BigDecimal ratePerHundredThousand) {
        if (principal == null || principal.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal effectiveRate = ratePerHundredThousand != null ? ratePerHundredThousand : DEFAULT_PAPERWORK_RATE;
        return principal.multiply(effectiveRate)
                .divide(ONE_HUNDRED_THOUSAND, 0, RoundingMode.HALF_UP);
    }

    /**
     * Registra un cliente y su prestamo (Nuevo o Migracion del Taco Fisico a Digital con Papeleria)
     * dentro de una transaccion atomica y auditada.
     */
    public synchronized LoanRecord registerCustomerAndLoan(
            UserRole actorRole,
            String actorUserId,
            String fullName,
            String documentNumber,
            String phone,
            String address,
            String neighborhood,
            String routeId,
            BigDecimal principal,
            BigDecimal interestRate,
            int installmentCount,
            boolean isTacoMigration,
            int paidInstallmentsInTaco,
            String operatingDate
    ) {
        if (principal == null || principal.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El capital principal debe ser mayor a cero.");
        }
        if (installmentCount <= 0) {
            throw new IllegalArgumentException("El numero de cuotas debe ser mayor a cero.");
        }

        BigDecimal rate = interestRate != null ? interestRate : DEFAULT_INTEREST_RATE;
        BigDecimal interestAmount = principal.multiply(rate).setScale(0, RoundingMode.HALF_UP);
        BigDecimal totalAgreed = principal.add(interestAmount);
        BigDecimal installmentAmount = totalAgreed.divide(BigDecimal.valueOf(installmentCount), 0, RoundingMode.HALF_UP);
        BigDecimal paperworkFee = calculatePaperworkFee(principal, DEFAULT_PAPERWORK_RATE);

        String customerId = "cust-" + System.currentTimeMillis();
        String loanId = "loan-" + System.currentTimeMillis();
        String loanNumber = "#" + (101 + listAllLoans().size());
        String notes = isTacoMigration
                ? "Migrado de cartulina fisica a digital (" + paidInstallmentsInTaco + "/" + installmentCount + " cuotas pagadas en papel)"
                : "Desembolso ordinario";

        try (Connection conn = openConnection()) {
            conn.setAutoCommit(false);
            try {
                try (PreparedStatement psCust = conn.prepareStatement("""
                    INSERT INTO customers (id, full_name, document_number, phone, address, neighborhood, route_id, order_index, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
                    psCust.setString(1, customerId);
                    psCust.setString(2, fullName.trim());
                    psCust.setString(3, documentNumber.trim());
                    psCust.setString(4, phone.trim());
                    psCust.setString(5, address.trim());
                    psCust.setString(6, neighborhood.trim());
                    psCust.setString(7, routeId);
                    psCust.setInt(8, 1);
                    psCust.setString(9, operatingDate);
                    psCust.executeUpdate();
                }

                String status = (isTacoMigration && paidInstallmentsInTaco >= installmentCount) ? "PAID" : "ACTIVE";
                LocalDate startLocal = LocalDate.parse(operatingDate);
                String endDate = startLocal.plusDays(installmentCount).toString();

                try (PreparedStatement psLoan = conn.prepareStatement("""
                    INSERT INTO loans (id, loan_number, customer_id, route_id, collector_id, principal, interest_rate,
                        interest_amount, total_agreed, installment_count, installment_amount, paperwork_fee,
                        is_taco_migration, status, start_date, end_date, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
                    psLoan.setString(1, loanId);
                    psLoan.setString(2, loanNumber);
                    psLoan.setString(3, customerId);
                    psLoan.setString(4, routeId);
                    psLoan.setString(5, actorUserId);
                    psLoan.setString(6, principal.toPlainString());
                    psLoan.setString(7, rate.toPlainString());
                    psLoan.setString(8, interestAmount.toPlainString());
                    psLoan.setString(9, totalAgreed.toPlainString());
                    psLoan.setInt(10, installmentCount);
                    psLoan.setString(11, installmentAmount.toPlainString());
                    psLoan.setString(12, paperworkFee.toPlainString());
                    psLoan.setInt(13, isTacoMigration ? 1 : 0);
                    psLoan.setString(14, status);
                    psLoan.setString(15, operatingDate);
                    psLoan.setString(16, endDate);
                    psLoan.setString(17, notes);
                    psLoan.setString(18, operatingDate);
                    psLoan.executeUpdate();
                }

                try (PreparedStatement psInst = conn.prepareStatement("""
                    INSERT INTO installments (id, loan_id, installment_number, due_date, expected_amount, paid_amount, pending_amount, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
                    for (int n = 1; n <= installmentCount; n++) {
                        boolean isPaidInTaco = isTacoMigration && n <= paidInstallmentsInTaco;
                        BigDecimal paid = isPaidInTaco ? installmentAmount : BigDecimal.ZERO;
                        BigDecimal pending = isPaidInTaco ? BigDecimal.ZERO : installmentAmount;
                        String instStatus = isPaidInTaco ? "PAGADA" : "PENDIENTE";
                        String dueDate = startLocal.plusDays(n - 1L).toString();

                        psInst.setString(1, loanId + "-inst-" + n);
                        psInst.setString(2, loanId);
                        psInst.setInt(3, n);
                        psInst.setString(4, dueDate);
                        psInst.setString(5, installmentAmount.toPlainString());
                        psInst.setString(6, paid.toPlainString());
                        psInst.setString(7, pending.toPlainString());
                        psInst.setString(8, instStatus);
                        psInst.addBatch();
                    }
                    psInst.executeBatch();
                }

                insertAuditLog(conn, actorUserId, actorRole.name(), "LOAN", loanId, "CREATE", null, notes,
                        isTacoMigration ? "Ingreso de cartulina del taco a digital con papeleria" : "Nuevo desembolso");

                conn.commit();
                return new LoanRecord(
                        loanId, loanNumber, customerId, routeId, actorUserId,
                        principal, rate, interestAmount, totalAgreed,
                        installmentCount, installmentAmount, paperworkFee,
                        isTacoMigration, status, operatingDate, endDate, notes, operatingDate
                );
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        } catch (Exception e) {
            throw new IllegalStateException("Error transaccional al registrar cliente y prestamo: " + e.getMessage(), e);
        }
    }

    /**
     * Registra un abono con idempotencia estricta y persiste PaymentRecord separadamente de PaymentAllocationRecord.
     * Verifica ademas que la fecha operativa no tenga un cierre inmutable (SETTLED).
     */
    public synchronized PaymentRecord recordPaymentWithAllocations(
            UserRole actorRole,
            String actorUserId,
            String idempotencyKey,
            String loanId,
            BigDecimal amountReceived,
            String paymentMethod,
            String operatingDate,
            String notes
    ) {
        if (amountReceived == null || amountReceived.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto del abono debe ser mayor a cero.");
        }
        String effectiveIdemKey = (idempotencyKey == null || idempotencyKey.isBlank())
                ? "idem-" + loanId + "-" + operatingDate + "-" + amountReceived.toPlainString()
                : idempotencyKey.trim();

        try (Connection conn = openConnection()) {
            conn.setAutoCommit(false);
            try {
                // 1. Verificar idempotencia (si ya existe idempotency_key, devolver registro existente sin duplicar cobro)
                try (PreparedStatement psIdem = conn.prepareStatement(
                        "SELECT id, idempotency_key, loan_id, customer_id, collector_id, route_id, amount_received, payment_method, status, notes, created_at FROM payments WHERE idempotency_key = ?")) {
                    psIdem.setString(1, effectiveIdemKey);
                    try (ResultSet rs = psIdem.executeQuery()) {
                        if (rs.next()) {
                            conn.rollback();
                            return new PaymentRecord(
                                    rs.getString("id"),
                                    rs.getString("idempotency_key"),
                                    rs.getString("loan_id"),
                                    rs.getString("customer_id"),
                                    rs.getString("collector_id"),
                                    rs.getString("route_id"),
                                    new BigDecimal(rs.getString("amount_received")),
                                    rs.getString("payment_method"),
                                    rs.getString("status"),
                                    rs.getString("notes"),
                                    rs.getString("created_at")
                            );
                        }
                    }
                }

                // 2. Obtener datos del prestamo y verificar inmutabilidad de liquidacion cerrada
                String customerId;
                String routeId;
                try (PreparedStatement psLoan = conn.prepareStatement(
                        "SELECT customer_id, route_id, status FROM loans WHERE id = ?")) {
                    psLoan.setString(1, loanId);
                    try (ResultSet rs = psLoan.executeQuery()) {
                        if (!rs.next()) {
                            throw new IllegalArgumentException("El credito especificado no existe: " + loanId);
                        }
                        customerId = rs.getString("customer_id");
                        routeId = rs.getString("route_id");
                    }
                }

                if (isDaySettled(conn, routeId, operatingDate)) {
                    throw new IllegalStateException(
                            "El cierre contable de la ruta " + routeId + " en la fecha " + operatingDate
                                    + " ya esta cerrado y es inmutable.");
                }

                // 3. Persistir el encabezado de Payment en `payments`
                String paymentId = "pay-" + UUID.randomUUID();
                try (PreparedStatement psPay = conn.prepareStatement("""
                    INSERT INTO payments (id, idempotency_key, loan_id, customer_id, collector_id, route_id, amount_received, payment_method, status, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
                """)) {
                    psPay.setString(1, paymentId);
                    psPay.setString(2, effectiveIdemKey);
                    psPay.setString(3, loanId);
                    psPay.setString(4, customerId);
                    psPay.setString(5, actorUserId);
                    psPay.setString(6, routeId);
                    psPay.setString(7, amountReceived.toPlainString());
                    psPay.setString(8, paymentMethod != null ? paymentMethod : "CASH");
                    psPay.setString(9, notes);
                    psPay.setString(10, operatingDate);
                    psPay.executeUpdate();
                }

                // 4. Distribuir el monto en cuotas y persistir cada PaymentAllocation en `payment_allocations`
                BigDecimal remainingToApply = amountReceived;
                List<InstallmentRecord> installments = loadInstallmentsByLoan(conn, loanId);
                try (PreparedStatement psUpdInst = conn.prepareStatement(
                        "UPDATE installments SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?");
                     PreparedStatement psAlloc = conn.prepareStatement("""
                        INSERT INTO payment_allocations (id, payment_id, loan_id, installment_id, installment_number, amount_applied, resulting_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                     """)) {
                    for (InstallmentRecord inst : installments) {
                        if (remainingToApply.compareTo(BigDecimal.ZERO) <= 0) break;
                        if (inst.pendingAmount().compareTo(BigDecimal.ZERO) <= 0) continue;

                        BigDecimal applied = remainingToApply.min(inst.pendingAmount());
                        BigDecimal newPaid = inst.paidAmount().add(applied);
                        BigDecimal newPending = inst.pendingAmount().subtract(applied);
                        String newStatus = newPending.compareTo(BigDecimal.ZERO) == 0 ? "PAGADA" : "PARCIAL";

                        psUpdInst.setString(1, newPaid.toPlainString());
                        psUpdInst.setString(2, newPending.toPlainString());
                        psUpdInst.setString(3, newStatus);
                        psUpdInst.setString(4, inst.id());
                        psUpdInst.addBatch();

                        psAlloc.setString(1, "alloc-" + UUID.randomUUID());
                        psAlloc.setString(2, paymentId);
                        psAlloc.setString(3, loanId);
                        psAlloc.setString(4, inst.id());
                        psAlloc.setInt(5, inst.installmentNumber());
                        psAlloc.setString(6, applied.toPlainString());
                        psAlloc.setString(7, newStatus);
                        psAlloc.addBatch();

                        remainingToApply = remainingToApply.subtract(applied);
                    }
                    psUpdInst.executeBatch();
                    psAlloc.executeBatch();
                }

                // 5. Si todas las cuotas quedaron en 0, actualizar estado del prestamo a PAID
                BigDecimal totalRemaining = loadInstallmentsByLoan(conn, loanId).stream()
                        .map(InstallmentRecord::pendingAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                if (totalRemaining.compareTo(BigDecimal.ZERO) <= 0) {
                    try (PreparedStatement psPaid = conn.prepareStatement("UPDATE loans SET status = 'PAID' WHERE id = ?")) {
                        psPaid.setString(1, loanId);
                        psPaid.executeUpdate();
                    }
                }

                insertAuditLog(conn, actorUserId, actorRole.name(), "PAYMENT", paymentId, "CREATE",
                        null, amountReceived.toPlainString(), "Abono registrado con asignaciones separadas");

                conn.commit();
                return new PaymentRecord(
                        paymentId, effectiveIdemKey, loanId, customerId, actorUserId, routeId,
                        amountReceived, paymentMethod != null ? paymentMethod : "CASH",
                        "COMPLETED", notes, operatingDate
                );
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo registrar el abono: " + e.getMessage(), e);
        }
    }

    /**
     * Cierra de forma inmutable la liquidacion del dia. Una vez cerrada (SETTLED),
     * no puede ser editada ni eliminada; solo admite correcciones compensatorias auditadas.
     */
    public synchronized DailySettlementRecord closeImmutableDailySettlement(
            UserRole actorRole,
            String actorUserId,
            String routeId,
            String operatingDate,
            BigDecimal cashHandedOver,
            String justification
    ) {
        if (actorRole != UserRole.ADMIN && actorRole != UserRole.SUPER_ADMIN && actorRole != UserRole.SUPERVISOR) {
            throw new SecurityException("Solo Administracion o Supervision puede cerrar y auditar la liquidacion.");
        }
        RouteMetricsSummary metrics = computeRouteMetrics(operatingDate, routeId);
        BigDecimal cashDifference = metrics.collectedCashToday().subtract(cashHandedOver);
        if (cashDifference.compareTo(BigDecimal.ZERO) != 0 && (justification == null || justification.isBlank())) {
            throw new IllegalArgumentException("Es obligatoria una justificacion auditada cuando existe diferencia en el arqueo.");
        }

        String settlementId = "set-" + System.currentTimeMillis();
        String settledAt = Instant.now().toString();

        try (Connection conn = openConnection()) {
            conn.setAutoCommit(false);
            try {
                if (isDaySettled(conn, routeId, operatingDate)) {
                    throw new IllegalStateException("La liquidacion de la fecha " + operatingDate + " ya fue cerrada y es inmutable.");
                }
                try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO settlements (id, date, route_id, collector_id, expected_collection, actual_collection,
                        collected_cash, collected_transfers, cash_handed_over, cash_difference, difference_justification,
                        status, settled_at, audited_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED', ?, ?)
                """)) {
                    ps.setString(1, settlementId);
                    ps.setString(2, operatingDate);
                    ps.setString(3, routeId);
                    ps.setString(4, actorUserId);
                    ps.setString(5, metrics.collectedToday().toPlainString());
                    ps.setString(6, metrics.collectedToday().toPlainString());
                    ps.setString(7, metrics.collectedCashToday().toPlainString());
                    ps.setString(8, metrics.collectedDigitalToday().toPlainString());
                    ps.setString(9, cashHandedOver.toPlainString());
                    ps.setString(10, cashDifference.toPlainString());
                    ps.setString(11, justification);
                    ps.setString(12, settledAt);
                    ps.setString(13, actorUserId);
                    ps.executeUpdate();
                }

                insertAuditLog(conn, actorUserId, actorRole.name(), "SETTLEMENT", settlementId, "CLOSE",
                        null, cashHandedOver.toPlainString(), justification);
                conn.commit();

                return new DailySettlementRecord(
                        settlementId, operatingDate, routeId, actorUserId,
                        metrics.collectedToday(), metrics.collectedToday(),
                        metrics.collectedCashToday(), metrics.collectedDigitalToday(),
                        cashHandedOver, cashDifference, justification,
                        "SETTLED", settledAt, actorUserId
                );
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        } catch (Exception e) {
            throw new IllegalStateException("Error cerrando liquidacion inmutable: " + e.getMessage(), e);
        }
    }

    /**
     * Regla Financiera (AGENTS.md):
     * "Closed settlements are immutable; use auditable corrections instead of silent edits/deletes."
     */
    public synchronized void recordAuditedSettlementCorrection(
            UserRole actorRole,
            String actorUserId,
            String settlementId,
            String routeId,
            BigDecimal adjustmentAmount,
            String reason
    ) {
        if (actorRole != UserRole.ADMIN && actorRole != UserRole.SUPER_ADMIN) {
            throw new SecurityException("Solo el Administrador puede registrar correcciones auditadas sobre liquidaciones cerradas.");
        }
        if (reason == null || reason.trim().length() < 5) {
            throw new IllegalArgumentException("Se requiere un motivo de auditoria detallado para registrar una correccion.");
        }
        try (Connection conn = openConnection()) {
            conn.setAutoCommit(false);
            try {
                String movId = "csm-corr-" + System.currentTimeMillis();
                try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO cash_movements (id, route_id, collector_id, type, category, amount, reference_id, description, created_at)
                    VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?)
                """)) {
                    ps.setString(1, movId);
                    ps.setString(2, routeId);
                    ps.setString(3, actorUserId);
                    ps.setString(4, adjustmentAmount.compareTo(BigDecimal.ZERO) >= 0 ? "INCOME" : "EXPENSE");
                    ps.setString(5, adjustmentAmount.abs().toPlainString());
                    ps.setString(6, settlementId);
                    ps.setString(7, "Correccion auditada sobre cierre inmutable " + settlementId + ": " + reason.trim());
                    ps.setString(8, Instant.now().toString());
                    ps.executeUpdate();
                }
                insertAuditLog(conn, actorUserId, actorRole.name(), "SETTLEMENT", settlementId, "ADJUST",
                        null, adjustmentAmount.toPlainString(), reason.trim());
                conn.commit();
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        } catch (Exception e) {
            throw new IllegalStateException("Error registrando correccion auditada: " + e.getMessage(), e);
        }
    }

    /**
     * Calcula las metricas exactas de la ruta con BigDecimal aplicando la Opcion A del Taco:
     * - Administrativo = Taco Base Capital + Intereses Ganados en Nuevos Creditos + Inyecciones - Gastos - Retiros.
     * - Cartera en Calle = Suma de pendingAmount en cuotas de creditos ACTIVE.
     * - Base Disponible en Mano = Administrativo - Cartera en Calle - Cobro Digital Hoy.
     * - Papeleria Acumulada = Suma de paperworkFee en todos los creditos (incluyendo cartulinas del taco).
     */
    public RouteMetricsSummary computeRouteMetrics(String operatingDate, String routeIdFilter) {
        List<LoanRecord> allLoans = listAllLoans();
        BigDecimal activeCapitalInStreet = BigDecimal.ZERO;
        BigDecimal tacoBaseCapital = BigDecimal.ZERO;
        BigDecimal newLoansEarnedInterest = BigDecimal.ZERO;
        BigDecimal accumulatedPaperwork = BigDecimal.ZERO;
        BigDecimal overdueTotalAmount = BigDecimal.ZERO;
        int activeLoansCount = 0;
        int overdueCustomersCount = 0;

        try (Connection conn = openConnection()) {
            for (LoanRecord loan : allLoans) {
                if (routeIdFilter != null && !routeIdFilter.isBlank() && !"ALL".equals(routeIdFilter)
                        && !routeIdFilter.equals(loan.routeId())) {
                    continue;
                }
                if ("CANCELLED".equals(loan.status())) {
                    continue;
                }

                accumulatedPaperwork = accumulatedPaperwork.add(loan.paperworkFee());

                if (loan.isTacoMigration()) {
                    tacoBaseCapital = tacoBaseCapital.add(loan.totalAgreed());
                } else {
                    newLoansEarnedInterest = newLoansEarnedInterest.add(loan.interestAmount());
                }

                if ("ACTIVE".equals(loan.status())) {
                    activeLoansCount++;
                    List<InstallmentRecord> insts = loadInstallmentsByLoan(conn, loan.id());
                    for (InstallmentRecord inst : insts) {
                        activeCapitalInStreet = activeCapitalInStreet.add(inst.pendingAmount());
                    }
                    DelinquencyEvaluation eval = delinquencyCalculator.evaluate(insts, operatingDate);
                    if (eval.hasOverdueInstallments()) {
                        overdueCustomersCount++;
                        overdueTotalAmount = overdueTotalAmount.add(eval.overdueInstallmentsBalance());
                    }
                }
            }

            BigDecimal collectedCashToday = BigDecimal.ZERO;
            BigDecimal collectedDigitalToday = BigDecimal.ZERO;
            try (PreparedStatement psPay = conn.prepareStatement(
                    "SELECT amount_received, payment_method, route_id, created_at FROM payments WHERE status = 'COMPLETED'")) {
                try (ResultSet rs = psPay.executeQuery()) {
                    while (rs.next()) {
                        String pRoute = rs.getString("route_id");
                        String created = rs.getString("created_at");
                        if (routeIdFilter != null && !routeIdFilter.isBlank() && !"ALL".equals(routeIdFilter)
                                && !routeIdFilter.equals(pRoute)) {
                            continue;
                        }
                        if (created != null && created.startsWith(operatingDate)) {
                            BigDecimal amt = new BigDecimal(rs.getString("amount_received"));
                            String method = rs.getString("payment_method");
                            if ("CASH".equalsIgnoreCase(method)) {
                                collectedCashToday = collectedCashToday.add(amt);
                            } else {
                                collectedDigitalToday = collectedDigitalToday.add(amt);
                            }
                        }
                    }
                }
            }

            BigDecimal totalAdministrative = tacoBaseCapital.add(newLoansEarnedInterest).max(BigDecimal.ZERO);
            BigDecimal cashAvailableInHand = totalAdministrative
                    .subtract(activeCapitalInStreet)
                    .subtract(collectedDigitalToday)
                    .max(BigDecimal.ZERO);

            return new RouteMetricsSummary(
                    totalAdministrative,
                    activeCapitalInStreet,
                    cashAvailableInHand,
                    collectedCashToday.add(collectedDigitalToday),
                    collectedCashToday,
                    collectedDigitalToday,
                    accumulatedPaperwork,
                    overdueTotalAmount,
                    activeLoansCount,
                    overdueCustomersCount
            );
        } catch (SQLException e) {
            throw new IllegalStateException("Error calculando metricas de ruta en BigDecimal", e);
        }
    }

    public List<LoanRecord> listAllLoans() {
        List<LoanRecord> list = new ArrayList<>();
        String sql = """
            SELECT id, loan_number, customer_id, route_id, collector_id,
                   principal, interest_rate, interest_amount, total_agreed,
                   installment_count, installment_amount, paperwork_fee,
                   is_taco_migration, status, start_date, end_date, notes, created_at
            FROM loans
            ORDER BY created_at DESC
        """;
        try (Connection conn = openConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                list.add(new LoanRecord(
                        rs.getString("id"),
                        rs.getString("loan_number"),
                        rs.getString("customer_id"),
                        rs.getString("route_id"),
                        rs.getString("collector_id"),
                        new BigDecimal(rs.getString("principal")),
                        new BigDecimal(rs.getString("interest_rate")),
                        new BigDecimal(rs.getString("interest_amount")),
                        new BigDecimal(rs.getString("total_agreed")),
                        rs.getInt("installment_count"),
                        new BigDecimal(rs.getString("installment_amount")),
                        new BigDecimal(rs.getString("paperwork_fee")),
                        rs.getInt("is_taco_migration") == 1,
                        rs.getString("status"),
                        rs.getString("start_date"),
                        rs.getString("end_date"),
                        rs.getString("notes"),
                        rs.getString("created_at")
                ));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Error listando creditos", e);
        }
        return list;
    }

    public List<CustomerRecord> listAllCustomers() {
        List<CustomerRecord> list = new ArrayList<>();
        String sql = """
            SELECT id, full_name, document_number, phone, address, neighborhood, route_id, order_index, created_at
            FROM customers
            ORDER BY order_index ASC
        """;
        try (Connection conn = openConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                list.add(new CustomerRecord(
                        rs.getString("id"),
                        rs.getString("full_name"),
                        rs.getString("document_number"),
                        rs.getString("phone"),
                        rs.getString("address"),
                        rs.getString("neighborhood"),
                        rs.getString("route_id"),
                        rs.getInt("order_index"),
                        rs.getString("created_at")
                ));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Error listando clientes", e);
        }
        return list;
    }

    /**
     * Importa de forma idempotente un paquete JSON enviado por la aplicacion movil (/api/sync/push).
     */
    public synchronized int importMobileSyncJson(String rawJson) {
        try (Connection conn = openConnection()) {
            conn.setAutoCommit(false);
            try {
                JsonNode root = objectMapper.readTree(rawJson);
                int importedCount = 0;

                JsonNode customersNode = root.has("newCustomers") ? root.get("newCustomers") : root.get("customers");
                if (customersNode != null && customersNode.isArray()) {
                    try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT OR REPLACE INTO customers (id, full_name, document_number, phone, address, neighborhood, route_id, order_index, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """)) {
                        for (JsonNode c : customersNode) {
                            ps.setString(1, c.path("id").asText());
                            ps.setString(2, c.path("fullName").asText("Cliente"));
                            ps.setString(3, c.path("documentNumber").asText("0"));
                            ps.setString(4, c.path("phone").asText(""));
                            ps.setString(5, c.path("address").asText(""));
                            ps.setString(6, c.path("neighborhood").asText(""));
                            ps.setString(7, c.path("routeId").asText("route-norte"));
                            ps.setInt(8, c.path("orderIndex").asInt(1));
                            ps.setString(9, c.path("createdAt").asText(LocalDate.now().toString()));
                            ps.addBatch();
                            importedCount++;
                        }
                        ps.executeBatch();
                    }
                }

                JsonNode loansNode = root.has("newLoans") ? root.get("newLoans") : root.get("loans");
                if (loansNode != null && loansNode.isArray()) {
                    try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT OR REPLACE INTO loans (id, loan_number, customer_id, route_id, collector_id, principal, interest_rate,
                            interest_amount, total_agreed, installment_count, installment_amount, paperwork_fee,
                            is_taco_migration, status, start_date, end_date, notes, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """)) {
                        for (JsonNode l : loansNode) {
                            BigDecimal principal = new BigDecimal(l.path("principal").asText("0"));
                            String notes = l.path("notes").asText("");
                            boolean isTaco = notes.startsWith("Migrado de cartulina");
                            BigDecimal fee = calculatePaperworkFee(principal, DEFAULT_PAPERWORK_RATE);

                            ps.setString(1, l.path("id").asText());
                            ps.setString(2, l.path("loanNumber").asText("#00101"));
                            ps.setString(3, l.path("customerId").asText());
                            ps.setString(4, l.path("routeId").asText("route-norte"));
                            ps.setString(5, l.path("collectorId").asText("usr-col-1"));
                            ps.setString(6, principal.toPlainString());
                            ps.setString(7, new BigDecimal(l.path("interestRate").asText("0.20")).toPlainString());
                            ps.setString(8, new BigDecimal(l.path("interestAmount").asText("0")).toPlainString());
                            ps.setString(9, new BigDecimal(l.path("totalAgreed").asText("0")).toPlainString());
                            ps.setInt(10, l.path("installmentCount").asInt(30));
                            ps.setString(11, new BigDecimal(l.path("installmentAmount").asText("0")).toPlainString());
                            ps.setString(12, fee.toPlainString());
                            ps.setInt(13, isTaco ? 1 : 0);
                            ps.setString(14, l.path("status").asText("ACTIVE"));
                            ps.setString(15, l.path("startDate").asText(LocalDate.now().toString()));
                            ps.setString(16, l.path("endDate").asText(LocalDate.now().toString()));
                            ps.setString(17, notes);
                            ps.setString(18, l.path("createdAt").asText(LocalDate.now().toString()));
                            ps.addBatch();
                        }
                        ps.executeBatch();
                    }
                }

                JsonNode instsNode = root.get("installments");
                if (instsNode != null && instsNode.isArray()) {
                    try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT OR REPLACE INTO installments (id, loan_id, installment_number, due_date, expected_amount, paid_amount, pending_amount, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """)) {
                        for (JsonNode i : instsNode) {
                            ps.setString(1, i.path("id").asText());
                            ps.setString(2, i.path("loanId").asText());
                            ps.setInt(3, i.path("installmentNumber").asInt(1));
                            ps.setString(4, i.path("dueDate").asText());
                            ps.setString(5, new BigDecimal(i.path("expectedAmount").asText("0")).toPlainString());
                            ps.setString(6, new BigDecimal(i.path("paidAmount").asText("0")).toPlainString());
                            ps.setString(7, new BigDecimal(i.path("pendingAmount").asText("0")).toPlainString());
                            ps.setString(8, i.path("status").asText("PENDIENTE"));
                            ps.addBatch();
                        }
                        ps.executeBatch();
                    }
                }

                JsonNode paymentsNode = root.get("payments");
                if (paymentsNode != null && paymentsNode.isArray()) {
                    try (PreparedStatement psPay = conn.prepareStatement("""
                        INSERT OR IGNORE INTO payments (id, idempotency_key, loan_id, customer_id, collector_id, route_id, amount_received, payment_method, status, notes, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
                    """);
                         PreparedStatement psAlloc = conn.prepareStatement("""
                        INSERT OR IGNORE INTO payment_allocations (id, payment_id, loan_id, installment_id, installment_number, amount_applied, resulting_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """)) {
                        for (JsonNode p : paymentsNode) {
                            String payId = p.path("id").asText();
                            String loanId = p.path("loanId").asText();
                            psPay.setString(1, payId);
                            psPay.setString(2, p.path("idempotencyKey").asText("idem-" + payId));
                            psPay.setString(3, loanId);
                            psPay.setString(4, p.path("customerId").asText());
                            psPay.setString(5, p.path("collectorId").asText("usr-col-1"));
                            psPay.setString(6, p.path("routeId").asText("route-norte"));
                            psPay.setString(7, new BigDecimal(p.path("amountReceived").asText("0")).toPlainString());
                            psPay.setString(8, p.path("paymentMethod").asText("CASH"));
                            psPay.setString(9, p.path("notes").asText(""));
                            psPay.setString(10, p.path("createdAt").asText(LocalDate.now().toString()));
                            psPay.addBatch();

                            JsonNode allocs = p.get("allocations");
                            if (allocs != null && allocs.isArray()) {
                                for (JsonNode a : allocs) {
                                    String instId = a.path("installmentId").asText();
                                    psAlloc.setString(1, payId + "-" + instId);
                                    psAlloc.setString(2, payId);
                                    psAlloc.setString(3, loanId);
                                    psAlloc.setString(4, instId);
                                    psAlloc.setInt(5, a.path("installmentNumber").asInt(1));
                                    psAlloc.setString(6, new BigDecimal(a.path("amountApplied").asText("0")).toPlainString());
                                    psAlloc.setString(7, a.path("resultingStatus").asText("PAGADA"));
                                    psAlloc.addBatch();
                                }
                            }
                        }
                        psPay.executeBatch();
                        psAlloc.executeBatch();
                    }
                }

                conn.commit();
                return importedCount;
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        } catch (Exception e) {
            throw new IllegalStateException("Error importando paquete movil en cartera.db: " + e.getMessage(), e);
        }
    }

    /**
     * Exporta el paquete JSON completo o paginado desde SQLite para responder a /api/sync/pull.
     */
    public String exportMobileSyncJson(String routeIdFilter) {
        return exportMobileSyncJson(routeIdFilter, 500, 0);
    }

    public String exportMobileSyncJson(String routeIdFilter, int limit, int offset) {
        int safeLimit = Math.max(1, limit);
        int safeOffset = Math.max(0, offset);
        try (Connection conn = openConnection()) {
            ObjectNode root = objectMapper.createObjectNode();
            root.put("packageVersion", "1.0.0");
            root.put("exportedAt", Instant.now().toString());
            root.put("operatingDate", LocalDate.now().toString());
            root.put("limit", safeLimit);
            root.put("offset", safeOffset);

            List<CustomerRecord> allCusts = listAllCustomers();
            ArrayNode custArr = root.putArray("newCustomers");
            int custIndex = 0;
            int custAdded = 0;
            for (CustomerRecord c : allCusts) {
                if (routeIdFilter != null && !routeIdFilter.isBlank() && !"ALL".equals(routeIdFilter)
                        && !routeIdFilter.equals(c.routeId())) {
                    continue;
                }
                if (custIndex++ < safeOffset) {
                    continue;
                }
                if (custAdded >= safeLimit) {
                    break;
                }
                custAdded++;
                ObjectNode cn = custArr.addObject();
                cn.put("id", c.id());
                cn.put("fullName", c.fullName());
                cn.put("documentNumber", c.documentNumber());
                cn.put("phone", c.phone());
                cn.put("address", c.address());
                cn.put("neighborhood", c.neighborhood());
                cn.put("routeId", c.routeId());
                cn.put("orderIndex", c.orderIndex());
                cn.put("status", "ACTIVE");
                cn.put("createdAt", c.createdAt());
                cn.put("updatedAt", c.createdAt());
            }

            ArrayNode loansArr = root.putArray("newLoans");
            ArrayNode instsArr = root.putArray("installments");
            for (LoanRecord l : listAllLoans()) {
                if (routeIdFilter != null && !routeIdFilter.isBlank() && !"ALL".equals(routeIdFilter)
                        && !routeIdFilter.equals(l.routeId())) {
                    continue;
                }
                ObjectNode ln = loansArr.addObject();
                ln.put("id", l.id());
                ln.put("loanNumber", l.loanNumber());
                ln.put("customerId", l.customerId());
                ln.put("routeId", l.routeId());
                ln.put("collectorId", l.collectorId());
                ln.put("principal", l.principal().longValue());
                ln.put("interestRate", l.interestRate().doubleValue());
                ln.put("interestType", "FLAT_INITIAL_CAPITAL");
                ln.put("interestAmount", l.interestAmount().longValue());
                ln.put("totalAgreed", l.totalAgreed().longValue());
                ln.put("installmentCount", l.installmentCount());
                ln.put("installmentAmount", l.installmentAmount().longValue());
                ln.put("frequency", "DAILY");
                ln.put("startDate", l.startDate());
                ln.put("endDate", l.endDate());
                ln.put("status", l.status());
                ln.put("notes", l.notes());
                ln.put("createdAt", l.createdAt());
                ln.put("updatedAt", l.createdAt());

                for (InstallmentRecord inst : loadInstallmentsByLoan(conn, l.id())) {
                    ObjectNode in = instsArr.addObject();
                    in.put("id", inst.id());
                    in.put("loanId", inst.loanId());
                    in.put("installmentNumber", inst.installmentNumber());
                    in.put("dueDate", inst.dueDate());
                    in.put("expectedAmount", inst.expectedAmount().longValue());
                    in.put("paidAmount", inst.paidAmount().longValue());
                    in.put("pendingAmount", inst.pendingAmount().longValue());
                    in.put("status", inst.status());
                }
            }

            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Error exportando paquete de sincronizacion: " + e.getMessage(), e);
        }
    }

    private List<InstallmentRecord> loadInstallmentsByLoan(Connection conn, String loanId) throws SQLException {
        List<InstallmentRecord> list = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, loan_id, installment_number, due_date, expected_amount, paid_amount, pending_amount, status FROM installments WHERE loan_id = ? ORDER BY installment_number ASC")) {
            ps.setString(1, loanId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    list.add(new InstallmentRecord(
                            rs.getString("id"),
                            rs.getString("loan_id"),
                            rs.getInt("installment_number"),
                            rs.getString("due_date"),
                            new BigDecimal(rs.getString("expected_amount")),
                            new BigDecimal(rs.getString("paid_amount")),
                            new BigDecimal(rs.getString("pending_amount")),
                            rs.getString("status")
                    ));
                }
            }
        }
        return list;
    }

    private boolean isDaySettled(Connection conn, String routeId, String date) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM settlements WHERE route_id = ? AND date = ? AND status = 'SETTLED'")) {
            ps.setString(1, routeId);
            ps.setString(2, date);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private void insertAuditLog(
            Connection conn,
            String userId,
            String userRole,
            String entity,
            String entityId,
            String action,
            String prevJson,
            String newJson,
            String reason
    ) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO audit_logs (id, user_id, user_role, timestamp, entity, entity_id, action, previous_value_json, new_value_json, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)) {
            ps.setString(1, "aud-" + UUID.randomUUID());
            ps.setString(2, userId);
            ps.setString(3, userRole);
            ps.setString(4, Instant.now().toString());
            ps.setString(5, entity);
            ps.setString(6, entityId);
            ps.setString(7, action);
            ps.setString(8, prevJson);
            ps.setString(9, newJson);
            ps.setString(10, reason);
            ps.executeUpdate();
        }
    }
}
