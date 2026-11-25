package com.cartera.sync.application;

import com.cartera.infrastructure.security.FinancialAccess;

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

    private final FinancialAccess access;
    private final RecordPaymentUseCase paymentUseCase;
    private final PaymentRepository paymentStore;
    private final PaymentAllocationRepository allocationStore;
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
            SystemSettingRepository settingRepository, FinancialAccess access, PaymentRepository paymentStore, PaymentAllocationRepository allocationStore
    ) {
        this.access = access;
        this.paymentStore=paymentStore;this.allocationStore=allocationStore;
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
        if (routeId == null || routeId.isBlank()) {
            return "";
        }
        if ("route-1".equalsIgnoreCase(routeId.trim())) {
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
        var actor=access.actor();
        if(!actor.canReverseOrCancel()){
            var assigned=routeRepository.findById(normalizeRouteId(requestedRouteId)).orElseThrow(()->new SecurityException("Ruta no disponible."));
            if(requestedRouteId==null || "ALL".equalsIgnoreCase(requestedRouteId) || !actor.userId().equals(assigned.getCollectorId()))throw new SecurityException("No puede exportar otras rutas.");
        }
        try {
            LocalDate opDate = operatingDate != null ? operatingDate : LocalDate.now();
            boolean filterByRoute = requestedRouteId != null && !requestedRouteId.isBlank() && !"ALL".equalsIgnoreCase(requestedRouteId.trim());
            String normalizedRoute = filterByRoute
                    ? normalizeRouteId(requestedRouteId)
                    : (routeRepository != null
                            ? routeRepository.findAll().stream()
                                    .filter(r -> r.getActive() == null || r.getActive() == 1)
                                    .map(RouteEntity::getId)
                                    .findFirst()
                                    .orElse("ALL")
                            : "ALL");

            RouteEntity routeEntity = (routeRepository != null && !normalizedRoute.isBlank() && !"ALL".equalsIgnoreCase(normalizedRoute))
                    ? routeRepository.findById(normalizedRoute).orElse(null)
                    : null;
            String routeName = routeEntity != null ? routeEntity.getName() : (filterByRoute ? normalizedRoute : "Todas las Rutas");
            String collectorId = (routeEntity != null && routeEntity.getCollectorId() != null && !routeEntity.getCollectorId().isBlank())
                    ? routeEntity.getCollectorId()
                    : actor.userId();

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
                cn.put("status", switch(c.getStatus()){case "INACTIVO"->"INACTIVE";case "BLOQUEADO"->"BLOCKED";default->"ACTIVE";});
                cn.put("assignedCollectorId",c.getCollectorId());
                cn.putArray("references");
                cn.put("createdAt",c.getCreatedAt());cn.put("updatedAt",c.getCreatedAt());
                cn.put("routeId", normalizeRouteId(c.getRouteId()));
                cn.put("collectorId", c.getCollectorId());
            }

            // 2. Route history is required for renewal and balance reconstruction in a fresh client.
            List<LoanEntity> activeLoans = loanRepository.findAll().stream()
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
                ln.put("frequency",mobileFrequency(l.getFrequency()));
                ln.put("startDate", l.getStartDate());
                ln.put("endDate", l.getEndDate());
                ln.put("status",mobileLoanStatus(l.getStatus()));
                ln.put("loanNumber","#"+l.getId().substring(0,Math.min(8,l.getId().length())));
                ln.put("interestType","FLAT_INITIAL_CAPITAL");
                ln.put("installmentAmount",l.getTotalAgreed().divide(BigDecimal.valueOf(l.getInstallmentCount()),0,java.math.RoundingMode.HALF_UP));
                ln.put("createdAt",l.getCreatedAt());ln.put("updatedAt",l.getCreatedAt());
                if("MIGRACION".equals(l.getOperationType()))ln.put("notes","Migrado de cartulina física; origen registrado en oficina");

                List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(l.getId());
                for (InstallmentEntity inst : insts) {
                    ObjectNode in = installmentsArr.addObject();
                    in.put("id", inst.getId());
                    in.put("loanId", inst.getLoanId());
                    in.put("installmentNumber", inst.getInstallmentNumber());
                    in.put("dueDate", inst.getDueDate());
                    in.put("amount", inst.getAmount());
                    in.put("expectedAmount",inst.getAmount());
                    in.put("paidAmount", inst.getPaidAmount());
                    in.put("pendingAmount", inst.getPendingAmount());
                    in.put("status", inst.getStatus());
                }
            }

            ArrayNode renewalsArr=root.putArray("renewals");
            for(var renewal:renewalRepository.findAll())if(activeLoanIds.contains(renewal.getPreviousLoanId()) && activeLoanIds.contains(renewal.getNewLoanId())){
                var rn=renewalsArr.addObject();rn.put("id",renewal.getId());rn.put("previousLoanId",renewal.getPreviousLoanId());rn.put("newLoanId",renewal.getNewLoanId());
                rn.put("newPrincipal",renewal.getNewPrincipal());rn.put("previousBalanceDeducted",renewal.getPreviousBalanceDeducted());rn.put("paperworkDeducted",renewal.getPaperworkDeducted());rn.put("actualCashDisbursed",renewal.getActualCashDisbursed());rn.put("createdAt",renewal.getCreatedAt());
            }
            ArrayNode paymentsArr=root.putArray("payments");
            for(var payment:paymentStore.findAll())if(activeLoanIds.contains(payment.getLoanId())){
                var pn=paymentsArr.addObject();String mobileId=auditLogRepository.findById("sync-payment-id-"+payment.getId()).map(AuditLogEntity::getNewValue).orElse(payment.getId());
                pn.put("id",mobileId);pn.put("idempotencyKey",payment.getIdempotencyKey());pn.put("loanId",payment.getLoanId());pn.put("customerId",payment.getCustomerId());pn.put("collectorId",payment.getCollectorId());pn.put("amountReceived",payment.getAmount());
                pn.put("paymentMethod",switch(com.cartera.payments.domain.PaymentMethods.normalize(payment.getMethod())){case "EFECTIVO"->"CASH";case "NEQUI"->"NEQUI";default->"TRANSFER";});
                pn.put("status","ANULADO".equals(payment.getStatus())?"REVERSED":"COMPLETED");pn.put("createdAt",payment.getCreatedAt());
                var breakdown=pn.putArray("allocations");
                for(var allocation:allocationStore.findByPaymentId(payment.getId())){
                    var an=breakdown.addObject();an.put("installmentId",allocation.getInstallmentId());an.put("amountApplied",allocation.getAmount());
                    installmentRepository.findById(allocation.getInstallmentId()).ifPresent(i->{an.put("installmentNumber",i.getInstallmentNumber());an.put("resultingStatus",i.getStatus());});
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

            // 4. Parámetros y políticas operativas (alineando claves Desktop ↔ Móvil)
            ObjectNode settingsNode = root.putObject("settings");
            if (settingRepository != null) {
                Set<String> allowedKeys = Set.of(
                        "company_name", "company_phone", "company_city",
                        "paperwork_enabled", "paperwork_fee", "exclude_sundays",
                        "max_new_loan_amount", "default_interest_percent", "default_interest_rate",
                        "route_allow_new_loans", "route_allow_expenses",
                        "route_allow_reorder", "route_allow_partial_payments"
                );
                String defaultInterestPercent = null;
                for (SystemSettingEntity s : settingRepository.findAll()) {
                    if (allowedKeys.contains(s.getSettingKey())) {
                        settingsNode.put(s.getSettingKey(), s.getSettingValue());
                        if ("default_interest_percent".equals(s.getSettingKey())) {
                            defaultInterestPercent = s.getSettingValue();
                        }
                    }
                }
                if (defaultInterestPercent != null && !settingsNode.has("default_interest_rate")) {
                    settingsNode.put("default_interest_rate", defaultInterestPercent);
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
        var actor = access.manager();
        if (jsonText == null || jsonText.isBlank()) {
            throw new IllegalArgumentException("El paquete JSON de sincronización está vacío.");
        }

        try {
            JsonNode rootNode = mapper.readTree(jsonText);

            String opDateStr = textOrDefault(rootNode, "operatingDate", LocalDate.now().toString());
            LocalDate opDate = LocalDate.parse(opDateStr.length() >= 10 ? opDateStr.substring(0, 10) : opDateStr);
            String packageRouteId = normalizeRouteId(textOrDefault(rootNode, "routeId", ""));
            if (packageRouteId.isBlank()) {
                throw new IllegalArgumentException("El paquete JSON debe indicar un routeId válido.");
            }
            String packageCollectorId = textOrDefault(rootNode, "collectorId", "");
            if (packageCollectorId.isBlank() && routeRepository != null) {
                packageCollectorId = routeRepository.findById(packageRouteId)
                        .map(RouteEntity::getCollectorId)
                        .orElse("");
            }
            if (packageCollectorId.isBlank()) {
                throw new IllegalArgumentException("El paquete JSON debe indicar un collectorId válido.");
            }

            validateScope(rootNode,packageRouteId,packageCollectorId);
            int customersImported = 0;
            int loansImported = 0;
            Set<String> createdLoanIds=new java.util.HashSet<>();
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
                                    customerStatus(textOrDefault(c, "status", "ACTIVO")),
                                    normalizeRouteId(textOrDefault(c, "routeId", packageRouteId)),
                                    textOrDefault(c, "collectorId", textOrDefault(c,"assignedCollectorId",packageCollectorId)),
                                    textOrDefault(c, "createdAt", opDateStr)
                            );
                            customerRepository.save(ce);
                            customersImported++;
                        }
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("Cliente inválido; paquete revertido: "+ex.getMessage(),ex);
                    }
                }
            }

            // 2. Procesar newLoans
            if (rootNode.has("newLoans") && rootNode.get("newLoans").isArray() && loanRepository != null) {
                for (JsonNode l : rootNode.get("newLoans")) {
                    try {
                        if (saveLoanFromJsonNode(l, rootNode, packageRouteId, packageCollectorId, opDate, opDateStr)) {
                            loansImported++;
                            createdLoanIds.add(l.path("id").asText());
                        }
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("Crédito inválido; paquete revertido: " + ex.getMessage(), ex);
                    }
                }
            }

            java.util.Set<String> predecessorPayments=new java.util.HashSet<>();
            for(JsonNode renewal:rootNode.path("renewals")){
                String previous=textOrDefault(renewal,"previousLoanId",textOrDefault(renewal,"oldLoanId",""));
                for(JsonNode payment:rootNode.path("payments"))if(previous.equals(payment.path("loanId").asText())){
                    String key=textOrDefault(payment,"idempotencyKey",textOrDefault(payment,"id",""));
                    var applied=applyImportedPayment(payment,packageCollectorId,opDate);
                    predecessorPayments.add(key);if(applied.alreadyExisted())paymentsSkipped++;else paymentsApplied++;
                }
            }
            // 3. Procesar renewals
            if (rootNode.has("renewals") && rootNode.get("renewals").isArray() && loanRepository != null) {
                for (JsonNode r : rootNode.get("renewals")) {
                    try {
                        String renewalId = textOrDefault(r, "id", "ren-" + UUID.randomUUID().toString().substring(0, 8));
                        String prevLoanId = textOrDefault(r, "previousLoanId", textOrDefault(r, "oldLoanId", null));
                        String newLoanId = textOrDefault(r, "newLoanId", null);

                        if (prevLoanId == null) throw new IllegalArgumentException("Falta el crédito anterior.");
                        if (r.has("newLoan") && r.get("newLoan").isObject()) {
                            saveLoanFromJsonNode(r.get("newLoan"), rootNode, packageRouteId, packageCollectorId, opDate, opDateStr);
                            if (newLoanId == null) newLoanId = textOrDefault(r.get("newLoan"), "id", null);
                        }
                        if (newLoanId == null) throw new IllegalArgumentException("Falta el crédito nuevo.");
                        BigDecimal newPrincipal = new BigDecimal(textOrDefault(r, "newPrincipal", "0"));
                        BigDecimal prevBal = new BigDecimal(textOrDefault(r, "previousBalanceDeducted", textOrDefault(r, "previousBalance", "0")));
                        BigDecimal paperwork = new BigDecimal(textOrDefault(r, "paperworkDeducted", textOrDefault(r, "paperworkFee", "0")));
                        BigDecimal netCash = new BigDecimal(textOrDefault(r, "actualCashDisbursed", textOrDefault(r, "netCashDisbursed", newPrincipal.subtract(prevBal).subtract(paperwork).toPlainString())));
                        var existing = renewalRepository.findByPreviousLoanId(prevLoanId);
                        if (existing.isPresent()) {
                            var saved = existing.get();
                            if (!saved.getId().equals(renewalId) || !saved.getNewLoanId().equals(newLoanId)
                                    || saved.getNewPrincipal().compareTo(newPrincipal) != 0 || saved.getPreviousBalanceDeducted().compareTo(prevBal) != 0
                                    || saved.getPaperworkDeducted().compareTo(paperwork) != 0 || saved.getActualCashDisbursed().compareTo(netCash) != 0)
                                throw new IllegalArgumentException("La renovación ya existe con otros datos.");
                            continue;
                        }
                        var prevLoan = loanRepository.findById(prevLoanId).orElseThrow(() -> new IllegalArgumentException("No existe crédito anterior."));
                        var nextLoan = loanRepository.findById(newLoanId).orElseThrow(() -> new IllegalArgumentException("No existe crédito nuevo."));
                        access.requireOpen(prevLoan.getRouteId(), prevLoan.getCollectorId(), opDate);
                        access.requireOpen(prevLoan.getRouteId(), prevLoan.getCollectorId(), LocalDate.now());
                        if (!"ACTIVO".equals(prevLoan.getStatus()) || !"ACTIVO".equals(nextLoan.getStatus())
                                || !prevLoan.getCustomerId().equals(nextLoan.getCustomerId())
                                || !prevLoan.getRouteId().equals(nextLoan.getRouteId())
                                || !prevLoan.getCollectorId().equals(nextLoan.getCollectorId())
                                || !prevLoanId.equals(nextLoan.getPreviousLoanId())
                                || newPrincipal.compareTo(nextLoan.getPrincipal()) != 0)
                            throw new IllegalArgumentException("La renovación no corresponde al contrato activo anterior.");
                        var previousInstallments = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(prevLoanId);
                        BigDecimal balance = previousInstallments.stream().map(InstallmentEntity::getPendingAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
                        if (prevBal.compareTo(balance) != 0 || newPrincipal.signum() <= 0 || paperwork.signum() < 0 || netCash.signum() < 0
                                || newPrincipal.subtract(prevBal).subtract(paperwork).compareTo(netCash) != 0)
                            throw new IllegalArgumentException("Saldo, papelería y efectivo de renovación no concilian.");
                        renewalRepository.save(new RenewalEntity(renewalId, prevLoanId, newLoanId, newPrincipal, prevBal, paperwork, netCash, opDateStr));
                        String timestamp = opDate.atTime(java.time.LocalTime.now()).toString();
                        if (netCash.signum() > 0) cashMovementRepository.save(new CashMovementEntity(
                                "sync-renewal-net-" + renewalId, prevLoan.getRouteId(), prevLoan.getCollectorId(), null,
                                "EGRESO", "DESEMBOLSO_RENOVACION", netCash, nextLoan.getId(), "Renovación importada: efectivo al cliente", timestamp));
                        if (paperwork.signum() > 0) cashMovementRepository.save(new CashMovementEntity(
                                "sync-renewal-paper-" + renewalId, prevLoan.getRouteId(), prevLoan.getCollectorId(), null,
                                "EGRESO", "PAPELERIA_RENOVACION", paperwork, nextLoan.getId(), "Papelería de renovación importada", timestamp));
                        prevLoan.setStatus("RENOVADO"); loanRepository.save(prevLoan);
                        for (var inst : previousInstallments) {
                            if (inst.getPendingAmount().signum() > 0) {
                                inst.setPaidAmount(inst.getAmount()); inst.setStatus("PAGADA"); installmentRepository.save(inst);
                            }
                        }
                        auditLogRepository.save(new AuditLogEntity(UUID.randomUUID().toString(), actor.userId(), "RENEWAL", renewalId,
                                "IMPORTAR_RENOVACION", "saldo=" + balance, "capital=" + newPrincipal + ";neto=" + netCash + ";papeleria=" + paperwork,
                                "Paquete móvil; transacción indivisible", timestamp));
                        renewalsImported++;
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("Renovación inválida; paquete revertido: " + ex.getMessage(), ex);
                    }
                }
            }

            // 4. Procesar Pagos
            if (rootNode.has("payments") && rootNode.get("payments").isArray() && paymentUseCase != null) {
                for (JsonNode p : rootNode.get("payments")) {
                    try {
                        String key=textOrDefault(p,"idempotencyKey",textOrDefault(p,"id",""));
                        if(predecessorPayments.contains(key))continue;
                        PaymentExecutionResult res=applyImportedPayment(p,packageCollectorId,opDate);
                        if (res.alreadyExisted()) {
                            paymentsSkipped++;
                        } else {
                            paymentsApplied++;
                        }
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("Pago inválido; paquete revertido: "+ex.getMessage(),ex);
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
                            String cmId = textOrDefault(cm, "id", "");
                            if(cmId.isBlank())throw new IllegalArgumentException("Gasto sin identificador estable.");
                            String normalizedCategory = cat.startsWith("GASTO_RUTA_") ? cat : "GASTO_RUTA_" + cat.toUpperCase();

                            if (cashMovementRepository.findById(cmId).isEmpty()) {
                                String expenseCollector = textOrDefault(cm, "collectorId", packageCollectorId);
                                String expenseRoute = normalizeRouteId(textOrDefault(cm, "routeId", packageRouteId));
                                String expenseDate = textOrDefault(cm, "createdAt", opDateStr);
                                access.requireOpen(expenseRoute, expenseCollector, LocalDate.parse(expenseDate.substring(0, 10)));
                                access.requireOpen(expenseRoute, expenseCollector, LocalDate.now());
                                if (amount.signum() <= 0) throw new IllegalArgumentException("Gasto importado no positivo.");
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
                        throw new IllegalArgumentException("Gasto inválido; paquete revertido: " + ex.getMessage(), ex);
                    }
                }
            }

            // A snapshot is evidence, never authority to silently rewrite a balance.
            for(JsonNode snapshot:rootNode.path("installments"))if(createdLoanIds.contains(snapshot.path("loanId").asText())){
                String id=snapshot.path("id").asText();var actual=installmentRepository.findById(id).orElseThrow(()->new IllegalArgumentException("Cuota de snapshot no encontrada."));
                BigDecimal expected=new BigDecimal(textOrDefault(snapshot,"paidAmount","0"));
                if(actual.getPaidAmount().compareTo(expected)!=0)throw new IllegalArgumentException("Los pagos no reconstruyen el snapshot de cuotas; requiere conciliación sin alterar el original.");
            }
            for(JsonNode snapshot:rootNode.path("newLoans"))if(createdLoanIds.contains(snapshot.path("id").asText())){
                String state=textOrDefault(snapshot,"status","ACTIVE");
                String expected=switch(state){case "ACTIVE","ACTIVO"->"ACTIVO";case "PAID","PAGADO","FINALIZADO"->"FINALIZADO";case "RENEWED","RENOVADO"->"RENOVADO";default->throw new IllegalArgumentException("Estado importado requiere conciliación explícita.");};
                if(!expected.equals(loanRepository.findById(snapshot.path("id").asText()).orElseThrow().getStatus()))throw new IllegalArgumentException("El estado del crédito no concilia con sus eventos.");
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

    private PaymentExecutionResult applyImportedPayment(JsonNode p,String collector,LocalDate date){
        String key=textOrDefault(p,"idempotencyKey",textOrDefault(p,"id",""));
        if(key.isBlank())throw new IllegalArgumentException("Pago sin identificador estable.");
        String created=textOrDefault(p,"createdAt",date.toString());
        var result=paymentUseCase.execute(new RecordPaymentCommand(textOrDefault(p,"loanId",""),
            new BigDecimal(textOrDefault(p,"amountReceived",textOrDefault(p,"amount","0"))),
            textOrDefault(p,"paymentMethod","CASH"),textOrDefault(p,"collectorId",collector),LocalDate.parse(created.substring(0,10)),key));
        String originalId=textOrDefault(p,"id",key);String mappingId="sync-payment-id-"+result.paymentId();
        var mapping=auditLogRepository.findById(mappingId);
        if(mapping.isPresent() && !originalId.equals(mapping.get().getNewValue()))throw new IllegalArgumentException("El mismo pago tiene identidades móviles contradictorias.");
        if(mapping.isEmpty())auditLogRepository.save(new AuditLogEntity(mappingId,access.actor().userId(),"PAYMENT_SYNC_ID",result.paymentId(),"VINCULAR_ID_MOVIL",null,originalId,"Identidad de origen preservada sin cambiar importes",LocalDateTime.now().toString()));
        return result;
    }
    private static String mobileFrequency(String value){return switch(frequency(value)){case "DIARIO"->"DAILY";case "SEMANAL"->"WEEKLY";case "QUINCENAL"->"BIWEEKLY";case "MENSUAL"->"MONTHLY";default->"FIXED_DATE";};}
    private static String mobileLoanStatus(String value){return switch(value){case "ACTIVO"->"ACTIVE";case "FINALIZADO","PAGADO","COMPLETADO"->"PAID";case "RENOVADO"->"RENEWED";case "ANULADO","CANCELADO"->"CANCELLED";default->throw new IllegalArgumentException("Estado de crédito no soportado para descarga móvil: " + value);};}
    private static String customerStatus(String value){return switch(value.toUpperCase(java.util.Locale.ROOT)){case "ACTIVE","ACTIVO"->"ACTIVO";case "INACTIVE","INACTIVO"->"INACTIVO";case "BLOCKED","BLOQUEADO"->"BLOQUEADO";default->throw new IllegalArgumentException("Estado de cliente desconocido.");};}
    private static String frequency(String value){return switch(value.toUpperCase(java.util.Locale.ROOT)){case "DAILY","DIARIO"->"DIARIO";case "WEEKLY","SEMANAL"->"SEMANAL";case "BIWEEKLY","QUINCENAL"->"QUINCENAL";case "MONTHLY","MENSUAL"->"MENSUAL";case "FIXED_DATE","FECHA_FIJA","FECHA FIJA"->"FECHA_FIJA";default->throw new IllegalArgumentException("Modalidad desconocida: " + value);};}
    private void validateScope(JsonNode root,String route,String collector){
        var assignment=routeRepository.findById(route).filter(r->Integer.valueOf(1).equals(r.getActive())).orElseThrow(()->new IllegalArgumentException("Ruta no disponible."));
        if(!collector.equals(assignment.getCollectorId()))throw new SecurityException("Cobrador no corresponde a la ruta.");
        for(String array:List.of("newCustomers","newLoans","payments","cashMovements"))for(JsonNode row:root.path(array)){
            if(!route.equals(normalizeRouteId(textOrDefault(row,"routeId",route))) || !collector.equals(textOrDefault(row,"collectorId",textOrDefault(row,"assignedCollectorId",collector))))throw new SecurityException("El paquete mezcla rutas o cobradores.");
        }
        for(JsonNode row:root.path("newLoans")){
            var customer=customerRepository.findById(row.path("customerId").asText());
            if(customer.isPresent() && (!route.equals(customer.get().getRouteId()) || !collector.equals(customer.get().getCollectorId())))throw new SecurityException("El cliente del crédito pertenece a otra ruta.");
        }
        for(String array:List.of("payments","promises","nonPaymentVisits"))for(JsonNode row:root.path(array)){
            String loanId=textOrDefault(row,"loanId","");var existing=loanRepository.findById(loanId);
            if(existing.isPresent()&&(!route.equals(existing.get().getRouteId())||!collector.equals(existing.get().getCollectorId())))throw new SecurityException("Crédito fuera de la ruta del paquete.");
        }
        for(JsonNode move:root.path("cashMovements"))if(Set.of("PAYMENT_REVERSAL","LOAN_CANCELLATION").contains(move.path("category").asText()))
            throw new IllegalArgumentException("El paquete contiene reversos que requieren conciliación explícita; no se reaplicarán como pagos o gastos.");
        for(JsonNode payment:root.path("payments"))if(Set.of("REVERSED","ANULADO","CANCELLED").contains(payment.path("status").asText()))throw new IllegalArgumentException("Pago reversado requiere conciliación explícita.");
    }

    private boolean saveLoanFromJsonNode(JsonNode l,
                                         JsonNode rootNode,
                                         String packageRouteId,
                                         String packageCollectorId,
                                         LocalDate opDate,
                                         String opDateStr) {
        String loanId = textOrDefault(l, "id", "");
        if(loanId.isBlank())throw new IllegalArgumentException("Crédito sin identificador estable.");
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
        String frequency = frequency(textOrDefault(l, "frequency", "DIARIO"));
        String startDateStr = textOrDefault(l, "startDate", opDate.toString());
        if (startDateStr.length() >= 10) startDateStr = startDateStr.substring(0, 10);
        String endDateStr = textOrDefault(l, "endDate", null);

        if (principal.signum() <= 0 || installmentCount <= 0 || interestRate.signum() < 0)
            throw new IllegalArgumentException("Términos de crédito importado inválidos.");
        // Packages in circulation use either fractions (0.2) or percentages (20).
        // Resolve only the representation that exactly reconciles with the agreed debt.
        BigDecimal fraction = interestRate;
        BigDecimal direct = new com.cartera.domain.money.Money(principal.multiply(BigDecimal.ONE.add(fraction))).amount();
        if (direct.compareTo(totalAgreed) != 0) {
            fraction = interestRate.movePointLeft(2);
            if (new com.cartera.domain.money.Money(principal.multiply(BigDecimal.ONE.add(fraction))).amount().compareTo(totalAgreed) != 0)
                throw new IllegalArgumentException("Capital, tasa y total importados no concilian.");
        }
        interestRate = fraction;
        interestAmount = totalAgreed.subtract(principal);
        access.requireOpen(textOrDefault(l, "routeId", packageRouteId), textOrDefault(l, "collectorId", packageCollectorId), opDate);
        access.requireOpen(textOrDefault(l, "routeId", packageRouteId), textOrDefault(l, "collectorId", packageCollectorId), LocalDate.now());
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
                "ACTIVO",
                textOrDefault(l, "createdAt", opDateStr)
        );
        loanRepository.save(le);

        if (installmentRepository != null) {
            boolean savedInsts = false;
            if (l.has("installments") && l.get("installments").isArray() && !l.get("installments").isEmpty()) {
                for (JsonNode instNode : l.get("installments")) {
                    saveInstallmentNode(instNode, loanId, rootNode, l);
                }
                savedInsts = true;
            } else if (rootNode.has("installments") && rootNode.get("installments").isArray()) {
                for (JsonNode instNode : rootNode.get("installments")) {
                    if (loanId.equals(textOrDefault(instNode, "loanId", ""))) {
                        saveInstallmentNode(instNode, loanId, rootNode, l);
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
        var schedule=installmentRepository.findByLoanId(loanId);
        if(schedule.stream().map(InstallmentEntity::getAmount).reduce(BigDecimal.ZERO,BigDecimal::add).compareTo(totalAgreed)!=0)
            throw new IllegalArgumentException("Las cuotas no suman la deuda pactada.");
        if(le.getPreviousLoanId()==null){
            boolean migration=textOrDefault(l,"notes","").startsWith("Migrado de cartulina") || "MIGRACION".equals(le.getOperationType());
            if(!migration){
                JsonNode disbursement=null;
                for(JsonNode movement:rootNode.path("cashMovements"))if(loanId.equals(movement.path("referenceId").asText()) && "LOAN_DISBURSEMENT".equals(movement.path("category").asText())){
                    if(disbursement!=null)throw new IllegalArgumentException("Desembolso duplicado en paquete.");disbursement=movement;
                }
                if(disbursement==null)throw new IllegalArgumentException("Crédito nuevo sin desembolso verificable; requiere revisión.");
                BigDecimal net=new BigDecimal(textOrDefault(disbursement,"amount","0"));
                if(net.signum()<0||net.compareTo(principal)>0)throw new IllegalArgumentException("Desembolso no concilia con capital.");
                if(net.signum()>0)cashMovementRepository.save(new CashMovementEntity("sync-origination-"+loanId,le.getRouteId(),le.getCollectorId(),null,
                    "EGRESO","DESEMBOLSO",net,loanId,"Desembolso importado verificable",opDateStr));
            }
        }
        return true;
    }

    private void saveInstallmentNode(JsonNode instNode, String loanId, JsonNode root, JsonNode loan) {
        int num = Integer.parseInt(textOrDefault(instNode, "installmentNumber", textOrDefault(instNode, "number", "1")));
        String instId = textOrDefault(instNode, "id", loanId + "-i" + num);
        if (installmentRepository.findById(instId).isEmpty()) {
            BigDecimal amount = new BigDecimal(textOrDefault(instNode, "amount", textOrDefault(instNode,"expectedAmount","0")));
            BigDecimal paidAmount = new BigDecimal(textOrDefault(instNode, "paidAmount", "0"));
            boolean migration=textOrDefault(loan,"notes","").startsWith("Migrado de cartulina") || "MIGRACION".equals(textOrDefault(loan,"operationType",""));
            if(migration && Set.of("RENEWED","RENOVADO").contains(textOrDefault(loan,"status","")))
                throw new IllegalArgumentException("Cartulina renovada sin desglose original: requiere revisión, no se deducirá el saldo.");
            if(migration){
                BigDecimal allocations=BigDecimal.ZERO;
                for(JsonNode payment:root.path("payments"))for(JsonNode allocation:payment.path("allocations"))
                    if(instId.equals(allocation.path("installmentId").asText())) allocations=allocations.add(new BigDecimal(textOrDefault(allocation,"amountApplied","0")));
                paidAmount=paidAmount.subtract(allocations);
            }else paidAmount=BigDecimal.ZERO; // Rebuild new origination from actual Payments, never count snapshot paidAmount twice.
            if(amount.signum()<=0 || paidAmount.signum()<0 || paidAmount.compareTo(amount)>0)throw new IllegalArgumentException("Cuota importada no concilia.");
            String dueDate = textOrDefault(instNode, "dueDate", LocalDate.now().toString());
            if (dueDate.length() >= 10) dueDate = dueDate.substring(0, 10);
            installmentRepository.save(new InstallmentEntity(
                    instId,
                    loanId,
                    num,
                    dueDate,
                    amount,
                    paidAmount,
                    paidAmount.signum()==0?"PENDIENTE":paidAmount.compareTo(amount)==0?"PAGADA":"PARCIAL"
            ));
        }
    }
}
