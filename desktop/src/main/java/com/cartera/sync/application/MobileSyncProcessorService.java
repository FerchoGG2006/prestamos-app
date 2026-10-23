package com.cartera.sync.application;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase.InstallmentPlanItem;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.RecordPaymentUseCase.PaymentExecutionResult;
import com.cartera.payments.application.RecordPaymentUseCase.RecordPaymentCommand;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Servicio transaccional para exportar paquetes de ruta móvil e importar paquetes de recaudos
 * (tanto desde el servidor HTTP Wi-Fi local como desde archivos JSON manuales).
 */
@Service
public class MobileSyncProcessorService {

    private final RecordPaymentUseCase paymentUseCase;
    private final CashMovementRepository cashMovementRepository;
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final CreateLoanUseCase createLoanUseCase;
    private final RenewalRepository renewalRepository;
    private final PaymentPromiseRepository paymentPromiseRepository;
    private final AuditLogRepository auditLogRepository;
    private final RouteRepository routeRepository;
    private final SystemSettingRepository settingRepository;
    private final ObjectMapper mapper;

    public MobileSyncProcessorService(
            RecordPaymentUseCase paymentUseCase,
            CashMovementRepository cashMovementRepository,
            CustomerRepository customerRepository,
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            CreateLoanUseCase createLoanUseCase,
            RenewalRepository renewalRepository,
            PaymentPromiseRepository paymentPromiseRepository,
            AuditLogRepository auditLogRepository,
            RouteRepository routeRepository,
            SystemSettingRepository settingRepository
    ) {
        this.paymentUseCase = paymentUseCase;
        this.cashMovementRepository = cashMovementRepository;
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.renewalRepository = renewalRepository;
        this.paymentPromiseRepository = paymentPromiseRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.settingRepository = settingRepository;
        this.mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public record SyncImportResult(
            String operatingDate,
            String routeId,
            String collectorId,
            int customersImported,
            int loansImported,
            int renewalsImported,
            int paymentsApplied,
            int paymentsSkipped,
            int paymentsFailed,
            int promisesImported,
            int visitsImported,
            int expensesImported,
            List<String> errorDetails,
            String summaryText
    ) {}

    public static String normalizeRouteId(String routeId) {
        if (routeId == null || routeId.isBlank() || "route-1".equalsIgnoreCase(routeId.trim())) {
            return "route-norte";
        }
        return routeId.trim();
    }

    private static String textOrDefault(JsonNode node, String field, String fallback) {
        if (node != null && node.hasNonNull(field)) {
            String val = node.get(field).asText();
            if (val != null && !val.isBlank()) return val;
        }
        return fallback;
    }

    /**
     * Genera el paquete JSON completo de una ruta para enviar o descargar en la app móvil.
     */
    @Transactional(readOnly = true)
    public String exportRoutePackage(String requestedRouteId, LocalDate operatingDate) {
        try {
            LocalDate opDate = operatingDate != null ? operatingDate : LocalDate.now();
            boolean filterByRoute = requestedRouteId != null && !requestedRouteId.isBlank() && !"ALL".equalsIgnoreCase(requestedRouteId.trim());
            String normalizedRoute = filterByRoute ? normalizeRouteId(requestedRouteId) : "route-norte";

            RouteEntity routeEntity = (routeRepository != null)
                    ? routeRepository.findById(normalizedRoute).orElse(null)
                    : null;
            String routeName = routeEntity != null ? routeEntity.getName() : (filterByRoute ? normalizedRoute : "Todas las Rutas");
            String collectorId = (routeEntity != null && routeEntity.getCollectorId() != null) ? routeEntity.getCollectorId() : "usr-col-1";

            ObjectNode root = mapper.createObjectNode();
            root.put("packageVersion", "1.0.0");
            root.put("generatedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            root.put("operatingDate", opDate.toString());
            root.put("routeId", normalizedRoute);
            root.put("routeName", routeName);
            root.put("collectorId", collectorId);

            // 1. Clientes activos de la ruta
            List<CustomerEntity> customers = customerRepository.findAll().stream()
                    .filter(c -> !"INACTIVO".equalsIgnoreCase(c.getStatus()))
                    .filter(c -> !filterByRoute || normalizedRoute.equalsIgnoreCase(normalizeRouteId(c.getRouteId())))
                    .toList();

            ArrayNode customersArr = root.putArray("customers");
            for (CustomerEntity c : customers) {
                ObjectNode cn = customersArr.addObject();
                cn.put("id", c.getId());
                cn.put("fullName", c.getFullName());
                cn.put("documentNumber", c.getDocumentNumber());
                cn.put("phone", c.getPhone());
                cn.put("altPhone", c.getAltPhone());
                cn.put("address", c.getAddress());
                cn.put("neighborhood", c.getNeighborhood());
                cn.put("city", c.getCity());
                cn.put("occupation", c.getOccupation());
                cn.put("businessName", c.getBusinessName());
                cn.put("notes", c.getNotes());
                cn.put("status", c.getStatus());
                cn.put("routeId", normalizeRouteId(c.getRouteId()));
                cn.put("collectorId", c.getCollectorId());
            }

            // 2. Préstamos activos de la ruta
            List<LoanEntity> activeLoans = loanRepository.findByStatus("ACTIVO").stream()
                    .filter(l -> !filterByRoute || normalizedRoute.equalsIgnoreCase(normalizeRouteId(l.getRouteId())))
                    .toList();
            Set<String> activeLoanIds = activeLoans.stream().map(LoanEntity::getId).collect(Collectors.toSet());

            ArrayNode loansArr = root.putArray("loans");
            ArrayNode installmentsArr = root.putArray("installments");

            for (LoanEntity l : activeLoans) {
                ObjectNode ln = loansArr.addObject();
                ln.put("id", l.getId());
                ln.put("customerId", l.getCustomerId());
                ln.put("routeId", normalizeRouteId(l.getRouteId()));
                ln.put("collectorId", l.getCollectorId());
                ln.put("previousLoanId", l.getPreviousLoanId());
                ln.put("operationType", l.getOperationType());
                ln.put("principal", l.getPrincipal());
                ln.put("interestRate", l.getInterestRate());
                ln.put("interestAmount", l.getInterestAmount());
                ln.put("totalAgreed", l.getTotalAgreed());
                ln.put("installmentCount", l.getInstallmentCount());
                ln.put("frequency", l.getFrequency());
                ln.put("startDate", l.getStartDate());
                ln.put("endDate", l.getEndDate());
                ln.put("status", l.getStatus());

                List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(l.getId());
                for (InstallmentEntity inst : insts) {
                    ObjectNode in = installmentsArr.addObject();
                    in.put("id", inst.getId());
                    in.put("loanId", inst.getLoanId());
                    in.put("installmentNumber", inst.getInstallmentNumber());
                    in.put("dueDate", inst.getDueDate());
                    in.put("amount", inst.getAmount());
                    in.put("paidAmount", inst.getPaidAmount());
                    in.put("pendingAmount", inst.getPendingAmount());
                    in.put("status", inst.getStatus());
                }
            }

            // 3. Promesas vigentes
            ArrayNode promisesArr = root.putArray("promises");
            if (paymentPromiseRepository != null) {
                for (PaymentPromiseEntity pr : paymentPromiseRepository.findAll()) {
                    if (pr.getLoanId() != null && activeLoanIds.contains(pr.getLoanId())) {
                        ObjectNode pn = promisesArr.addObject();
                        pn.put("id", pr.getId());
                        pn.put("customerId", pr.getCustomerId());
                        pn.put("loanId", pr.getLoanId());
                        pn.put("promisedAmount", pr.getPromisedAmount());
                        pn.put("promisedDate", pr.getPromisedDate());
                        pn.put("status", pr.getStatus());
                        pn.put("notes", pr.getNotes());
                    }
                }
            }

            // 4. Parámetros y políticas operativas
            ObjectNode settingsNode = root.putObject("settings");
            if (settingRepository != null) {
                for (SystemSettingEntity s : settingRepository.findAll()) {
                    settingsNode.put(s.getSettingKey(), s.getSettingValue());
                }
            }

            return mapper.writeValueAsString(root);
        } catch (Exception ex) {
            throw new IllegalStateException("Error generando paquete de ruta JSON: " + ex.getMessage(), ex);
        }
    }

    /**
     * Procesa e importa de forma idempotente un paquete JSON proveniente del móvil.
     */
    @Transactional
    public SyncImportResult importPackage(String jsonText) {
        if (jsonText == null || jsonText.isBlank()) {
            throw new IllegalArgumentException("El paquete JSON de sincronización está vacío.");
        }

        try {
            JsonNode rootNode = mapper.readTree(jsonText);

            String opDateStr = textOrDefault(rootNode, "operatingDate", LocalDate.now().toString());
            LocalDate opDate = LocalDate.parse(opDateStr.length() >= 10 ? opDateStr.substring(0, 10) : opDateStr);
            String packageCollectorId = textOrDefault(rootNode, "collectorId", "usr-col-1");
            String packageRouteId = normalizeRouteId(textOrDefault(rootNode, "routeId", "route-norte"));

            int customersImported = 0;
            int loansImported = 0;
            int renewalsImported = 0;
            int paymentsApplied = 0;
            int paymentsSkipped = 0;
            int paymentsFailed = 0;
            int promisesImported = 0;
            int visitsImported = 0;
            int expensesImported = 0;
            List<String> errorDetails = new ArrayList<>();

            // 1. Procesar newCustomers
            if (rootNode.has("newCustomers") && rootNode.get("newCustomers").isArray() && customerRepository != null) {
                for (JsonNode c : rootNode.get("newCustomers")) {
                    try {
                        String id = textOrDefault(c, "id", "cust-" + UUID.randomUUID().toString().substring(0, 8));
                        String doc = textOrDefault(c, "documentNumber", textOrDefault(c, "documentId", "DOC-" + id));
                        if (customerRepository.findById(id).isEmpty() && customerRepository.findByDocumentNumber(doc).isEmpty()) {
                            CustomerEntity ce = new CustomerEntity(
                                    id,
                                    textOrDefault(c, "fullName", "Cliente Móvil"),
                                    doc,
                                    textOrDefault(c, "phone", "0000000000"),
                                    textOrDefault(c, "altPhone", null),
                                    textOrDefault(c, "address", "Dirección en ruta"),
                                    textOrDefault(c, "neighborhood", "Centro"),
                                    textOrDefault(c, "city", "Local"),
                                    textOrDefault(c, "occupation", null),
                                    textOrDefault(c, "businessName", null),
                                    textOrDefault(c, "notes", "Creado desde ruta móvil"),
                                    textOrDefault(c, "status", "ACTIVO"),
                                    normalizeRouteId(textOrDefault(c, "routeId", packageRouteId)),
                                    textOrDefault(c, "collectorId", packageCollectorId),
                                    textOrDefault(c, "createdAt", opDateStr)
                            );
                            customerRepository.save(ce);
                            customersImported++;
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Cliente: " + ex.getMessage());
                    }
                }
            }

            // 2. Procesar newLoans
            if (rootNode.has("newLoans") && rootNode.get("newLoans").isArray() && loanRepository != null) {
                for (JsonNode l : rootNode.get("newLoans")) {
                    try {
                        if (saveLoanFromJsonNode(l, rootNode, packageRouteId, packageCollectorId, opDate, opDateStr)) {
                            loansImported++;
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Crédito: " + ex.getMessage());
                    }
                }
            }

            // 3. Procesar renewals
            if (rootNode.has("renewals") && rootNode.get("renewals").isArray() && loanRepository != null) {
                for (JsonNode r : rootNode.get("renewals")) {
                    try {
                        String renewalId = textOrDefault(r, "id", "ren-" + UUID.randomUUID().toString().substring(0, 8));
                        String prevLoanId = textOrDefault(r, "previousLoanId", textOrDefault(r, "oldLoanId", null));
                        String newLoanId = textOrDefault(r, "newLoanId", null);

                        if (prevLoanId != null) {
                            loanRepository.findById(prevLoanId).ifPresent(prevLoan -> {
                                prevLoan.setStatus("RENOVADO");
                                loanRepository.save(prevLoan);
                            });
                            if (installmentRepository != null) {
                                List<InstallmentEntity> prevInsts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(prevLoanId);
                                for (InstallmentEntity inst : prevInsts) {
                                    if (inst.getPendingAmount() != null && inst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0) {
                                        inst.setPaidAmount(inst.getAmount());
                                        inst.setStatus("PAGADA");
                                        installmentRepository.save(inst);
                                    }
                                }
                            }
                        }

                        if (r.has("newLoan") && r.get("newLoan").isObject()) {
                            saveLoanFromJsonNode(r.get("newLoan"), rootNode, packageRouteId, packageCollectorId, opDate, opDateStr);
                            if (newLoanId == null) {
                                newLoanId = textOrDefault(r.get("newLoan"), "id", null);
                            }
                        }

                        if (renewalRepository != null && prevLoanId != null && newLoanId != null && renewalRepository.findById(renewalId).isEmpty()) {
                            BigDecimal newPrincipal = new BigDecimal(textOrDefault(r, "newPrincipal", "0"));
                            BigDecimal prevBal = new BigDecimal(textOrDefault(r, "previousBalanceDeducted", textOrDefault(r, "previousBalance", "0")));
                            BigDecimal paperwork = new BigDecimal(textOrDefault(r, "paperworkDeducted", textOrDefault(r, "paperworkFee", "0")));
                            BigDecimal netCash = new BigDecimal(textOrDefault(r, "actualCashDisbursed", textOrDefault(r, "netCashDisbursed", newPrincipal.subtract(prevBal).subtract(paperwork).toPlainString())));
                            renewalRepository.save(new RenewalEntity(
                                    renewalId,
                                    prevLoanId,
                                    newLoanId,
                                    newPrincipal,
                                    prevBal,
                                    paperwork,
                                    netCash,
                                    textOrDefault(r, "createdAt", opDateStr)
                            ));
                            renewalsImported++;
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Renovación: " + ex.getMessage());
                    }
                }
            }

            // 4. Procesar Pagos
            if (rootNode.has("payments") && rootNode.get("payments").isArray() && paymentUseCase != null) {
                for (JsonNode p : rootNode.get("payments")) {
                    try {
                        String loanId = textOrDefault(p, "loanId", "");
                        String amountRaw = textOrDefault(p, "amountReceived", textOrDefault(p, "amount", "0"));
                        BigDecimal amount = new BigDecimal(amountRaw);
                        String method = textOrDefault(p, "paymentMethod", "CASH");
                        String collectorId = textOrDefault(p, "collectorId", packageCollectorId);
                        String idempotencyKey = textOrDefault(p, "idempotencyKey", textOrDefault(p, "id", "sync-" + UUID.randomUUID()));

                        LocalDate paymentDate = opDate;
                        String createdAtStr = textOrDefault(p, "createdAt", null);
                        if (createdAtStr != null && createdAtStr.length() >= 10) {
                            try {
                                paymentDate = LocalDate.parse(createdAtStr.substring(0, 10));
                            } catch (Exception ignored) {}
                        }

                        PaymentExecutionResult res = paymentUseCase.execute(new RecordPaymentCommand(
                                loanId,
                                amount,
                                method,
                                collectorId,
                                paymentDate,
                                idempotencyKey
                        ));
                        if (res.alreadyExisted()) {
                            paymentsSkipped++;
                        } else {
                            paymentsApplied++;
                        }
                    } catch (Exception ex) {
                        paymentsFailed++;
                        errorDetails.add("Pago (" + textOrDefault(p, "loanId", "?") + "): " + ex.getMessage());
                    }
                }
            }

            // 5. Procesar Promesas de Pago (promises)
            if (rootNode.has("promises") && rootNode.get("promises").isArray() && paymentPromiseRepository != null) {
                for (JsonNode pr : rootNode.get("promises")) {
                    try {
                        String prId = textOrDefault(pr, "id", "prom-" + UUID.randomUUID().toString().substring(0, 8));
                        if (paymentPromiseRepository.findById(prId).isEmpty()) {
                            String loanId = textOrDefault(pr, "loanId", "");
                            String customerId = textOrDefault(pr, "customerId", "");
                            if (customerId.isBlank() && loanRepository != null && !loanId.isBlank()) {
                                customerId = loanRepository.findById(loanId).map(LoanEntity::getCustomerId).orElse("");
                            }
                            BigDecimal promisedAmount = new BigDecimal(textOrDefault(pr, "promisedAmount", textOrDefault(pr, "amount", "0")));
                            String promisedDate = textOrDefault(pr, "promisedDate", opDateStr);
                            if (promisedDate.length() >= 10) promisedDate = promisedDate.substring(0, 10);

                            paymentPromiseRepository.save(new PaymentPromiseEntity(
                                    prId,
                                    customerId,
                                    loanId,
                                    promisedAmount,
                                    promisedDate,
                                    textOrDefault(pr, "status", "VIGENTE"),
                                    textOrDefault(pr, "notes", "Promesa registrada en ruta móvil"),
                                    textOrDefault(pr, "createdAt", opDateStr)
                            ));
                            promisesImported++;
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Promesa: " + ex.getMessage());
                    }
                }
            }

            // 6. Procesar Visitas sin Pago (nonPaymentVisits)
            if (rootNode.has("nonPaymentVisits") && rootNode.get("nonPaymentVisits").isArray() && auditLogRepository != null) {
                for (JsonNode v : rootNode.get("nonPaymentVisits")) {
                    try {
                        String vId = textOrDefault(v, "id", "visit-" + UUID.randomUUID().toString().substring(0, 8));
                        if (auditLogRepository.findById(vId).isEmpty()) {
                            String loanId = textOrDefault(v, "loanId", textOrDefault(v, "customerId", "N/A"));
                            String reason = textOrDefault(v, "reason", textOrDefault(v, "notes", "Visita sin pago en ruta"));
                            auditLogRepository.save(new AuditLogEntity(
                                    vId,
                                    textOrDefault(v, "collectorId", packageCollectorId),
                                    "NON_PAYMENT_VISIT",
                                    loanId,
                                    "VISITA_NO_PAGO",
                                    null,
                                    reason,
                                    reason,
                                    textOrDefault(v, "createdAt", opDateStr)
                            ));
                            visitsImported++;
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Visita: " + ex.getMessage());
                    }
                }
            }

            // 7. Procesar Gastos de Caja (CashMovements)
            if (rootNode.has("cashMovements") && rootNode.get("cashMovements").isArray() && cashMovementRepository != null) {
                for (JsonNode cm : rootNode.get("cashMovements")) {
                    try {
                        String type = textOrDefault(cm, "type", "EXPENSE");
                        String cat = textOrDefault(cm, "category", "EXPENSE");
                        boolean isDisbursementOrBase = "LOAN_DISBURSEMENT".equalsIgnoreCase(cat)
                                || "RENEWAL_DISBURSEMENT".equalsIgnoreCase(cat)
                                || "INITIAL_BASE".equalsIgnoreCase(cat)
                                || "DESEMBOLSO_CREDITO".equalsIgnoreCase(cat);
                        if (("EXPENSE".equalsIgnoreCase(type) || "EGRESO".equalsIgnoreCase(type) || "SALIDA".equalsIgnoreCase(type))
                                && !isDisbursementOrBase) {
                            BigDecimal amount = new BigDecimal(textOrDefault(cm, "amount", "0"));
                            String desc = textOrDefault(cm, "description", "Gasto de ruta móvil");
                            String cmId = textOrDefault(cm, "id", UUID.randomUUID().toString());
                            String normalizedCategory = cat.startsWith("GASTO_RUTA_") ? cat : "GASTO_RUTA_" + cat.toUpperCase();

                            if (cashMovementRepository.findById(cmId).isEmpty()) {
                                cashMovementRepository.save(new CashMovementEntity(
                                        cmId,
                                        normalizeRouteId(textOrDefault(cm, "routeId", packageRouteId)),
                                        textOrDefault(cm, "collectorId", packageCollectorId),
                                        textOrDefault(cm, "sessionId", null),
                                        "EGRESO",
                                        normalizedCategory,
                                        amount,
                                        null,
                                        desc,
                                        textOrDefault(cm, "createdAt", opDateStr)
                                ));
                                expensesImported++;
                            }
                        }
                    } catch (Exception ex) {
                        errorDetails.add("Gasto: " + ex.getMessage());
                    }
                }
            }

            StringBuilder summary = new StringBuilder();
            summary.append(String.format("• Pagos aplicados a cartera: %d\n", paymentsApplied));
            summary.append(String.format("• Pagos ya existentes (omitidos por idempotencia): %d\n", paymentsSkipped));
            if (paymentsFailed > 0) {
                summary.append(String.format("• Pagos con error: %d\n", paymentsFailed));
            }
            if (customersImported > 0) summary.append(String.format("• Nuevos clientes importados: %d\n", customersImported));
            if (loansImported > 0) summary.append(String.format("• Nuevos créditos importados: %d\n", loansImported));
            if (renewalsImported > 0) summary.append(String.format("• Renovaciones registradas: %d\n", renewalsImported));
            if (promisesImported > 0) summary.append(String.format("• Promesas de pago registradas: %d\n", promisesImported));
            if (visitsImported > 0) summary.append(String.format("• Visitas sin pago auditadas: %d\n", visitsImported));
            summary.append(String.format("• Gastos de ruta cargados a caja: %d\n", expensesImported));
            summary.append(String.format("• Fecha operativa: %s (Ruta: %s)", opDateStr, packageRouteId));

            if (!errorDetails.isEmpty()) {
                summary.append("\n\nAdvertencias/Errores:\n");
                for (int i = 0; i < Math.min(5, errorDetails.size()); i++) {
                    summary.append(" - ").append(errorDetails.get(i)).append("\n");
                }
            }

            if (auditLogRepository != null) {
                String author = UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::userId)
                        .orElse(packageCollectorId);
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        author,
                        "MOBILE_SYNC",
                        packageRouteId,
                        "IMPORTAR_PAQUETE_MOVIL",
                        null,
                        "pagos=" + paymentsApplied + ";clientes=" + customersImported + ";creditos=" + loansImported + ";gastos=" + expensesImported,
                        "Sincronización de paquete de ruta móvil",
                        LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                ));
            }

            return new SyncImportResult(
                    opDateStr,
                    packageRouteId,
                    packageCollectorId,
                    customersImported,
                    loansImported,
                    renewalsImported,
                    paymentsApplied,
                    paymentsSkipped,
                    paymentsFailed,
                    promisesImported,
                    visitsImported,
                    expensesImported,
                    errorDetails,
                    summary.toString()
            );
        } catch (Exception ex) {
            throw new IllegalArgumentException("Error al procesar paquete JSON: " + ex.getMessage(), ex);
        }
    }

    private boolean saveLoanFromJsonNode(JsonNode l,
                                         JsonNode rootNode,
                                         String packageRouteId,
                                         String packageCollectorId,
                                         LocalDate opDate,
                                         String opDateStr) {
        String loanId = textOrDefault(l, "id", "ln-" + UUID.randomUUID().toString().substring(0, 8));
        if (loanRepository.findById(loanId).isPresent()) {
            return false;
        }
        String customerId = textOrDefault(l, "customerId", "");
        BigDecimal principal = new BigDecimal(textOrDefault(l, "principal", "0"));
        BigDecimal interestRate = new BigDecimal(textOrDefault(l, "interestRate", "20"));
        BigDecimal interestAmount = new BigDecimal(textOrDefault(l, "interestAmount",
                principal.multiply(interestRate).divide(new BigDecimal("100")).toPlainString()));
        BigDecimal totalAgreed = new BigDecimal(textOrDefault(l, "totalAgreed", principal.add(interestAmount).toPlainString()));
        int installmentCount = Integer.parseInt(textOrDefault(l, "installmentCount", "30"));
        String frequency = textOrDefault(l, "frequency", "DIARIO");
        String startDateStr = textOrDefault(l, "startDate", opDate.toString());
        if (startDateStr.length() >= 10) startDateStr = startDateStr.substring(0, 10);
        String endDateStr = textOrDefault(l, "endDate", null);

        LoanEntity le = new LoanEntity(
                loanId,
                customerId,
                normalizeRouteId(textOrDefault(l, "routeId", packageRouteId)),
                textOrDefault(l, "collectorId", packageCollectorId),
                textOrDefault(l, "previousLoanId", null),
                textOrDefault(l, "operationType", "NUEVO"),
                principal,
                interestRate,
                interestAmount,
                totalAgreed,
                installmentCount,
                frequency,
                startDateStr,
                endDateStr,
                textOrDefault(l, "status", "ACTIVO"),
                textOrDefault(l, "createdAt", opDateStr)
        );
        loanRepository.save(le);

        if (installmentRepository != null) {
            boolean savedInsts = false;
            if (l.has("installments") && l.get("installments").isArray() && !l.get("installments").isEmpty()) {
                for (JsonNode instNode : l.get("installments")) {
                    saveInstallmentNode(instNode, loanId);
                }
                savedInsts = true;
            } else if (rootNode.has("installments") && rootNode.get("installments").isArray()) {
                for (JsonNode instNode : rootNode.get("installments")) {
                    if (loanId.equals(textOrDefault(instNode, "loanId", ""))) {
                        saveInstallmentNode(instNode, loanId);
                        savedInsts = true;
                    }
                }
            }
            if (!savedInsts && createLoanUseCase != null) {
                List<InstallmentPlanItem> plan = createLoanUseCase.simulatePlan(
                        totalAgreed, installmentCount, frequency, LocalDate.parse(startDateStr));
                for (InstallmentPlanItem item : plan) {
                    installmentRepository.save(new InstallmentEntity(
                            loanId + "-i" + item.installmentNumber(),
                            loanId,
                            item.installmentNumber(),
                            item.dueDate().toString(),
                            item.amount(),
                            BigDecimal.ZERO,
                            "PENDIENTE"
                    ));
                }
            }
        }
        return true;
    }

    private void saveInstallmentNode(JsonNode instNode, String loanId) {
        int num = Integer.parseInt(textOrDefault(instNode, "installmentNumber", textOrDefault(instNode, "number", "1")));
        String instId = textOrDefault(instNode, "id", loanId + "-i" + num);
        if (installmentRepository.findById(instId).isEmpty()) {
            BigDecimal amount = new BigDecimal(textOrDefault(instNode, "amount", "0"));
            BigDecimal paidAmount = new BigDecimal(textOrDefault(instNode, "paidAmount", "0"));
            String dueDate = textOrDefault(instNode, "dueDate", LocalDate.now().toString());
            if (dueDate.length() >= 10) dueDate = dueDate.substring(0, 10);
            installmentRepository.save(new InstallmentEntity(
                    instId,
                    loanId,
                    num,
                    dueDate,
                    amount,
                    paidAmount,
                    textOrDefault(instNode, "status", "PENDIENTE")
            ));
        }
    }
}
