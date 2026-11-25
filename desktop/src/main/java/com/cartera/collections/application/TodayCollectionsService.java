package com.cartera.collections.application;

import com.cartera.settlement.application.CashLedger;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import com.cartera.infrastructure.persistence.entity.RenewalEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentPromiseRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.persistence.repository.RenewalRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.sync.application.DesktopCloudSyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TodayCollectionsService {
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final CashMovementRepository cashMovementRepository;
    private final PaymentPromiseRepository paymentPromiseRepository;
    private final RouteRepository routeRepository;
    private final RenewalRepository renewalRepository;
    private final SystemSettingRepository settingRepository;

    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository) {
        this(customerRepository, loanRepository, installmentRepository, paymentRepository, cashMovementRepository, null, null, null, null);
    }

    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository,
                                   PaymentPromiseRepository paymentPromiseRepository) {
        this(customerRepository, loanRepository, installmentRepository, paymentRepository, cashMovementRepository, paymentPromiseRepository, null, null, null);
    }

    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository,
                                   PaymentPromiseRepository paymentPromiseRepository,
                                   RouteRepository routeRepository,
                                   RenewalRepository renewalRepository) {
        this(customerRepository, loanRepository, installmentRepository, paymentRepository, cashMovementRepository,
                paymentPromiseRepository, routeRepository, renewalRepository, null);
    }

    @Autowired
    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository,
                                   PaymentPromiseRepository paymentPromiseRepository,
                                   RouteRepository routeRepository,
                                   RenewalRepository renewalRepository,
                                   @Autowired(required = false) SystemSettingRepository settingRepository) {
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.paymentPromiseRepository = paymentPromiseRepository;
        this.routeRepository = routeRepository;
        this.renewalRepository = renewalRepository;
        this.settingRepository = settingRepository;
    }

    public enum CollectionPeriod {
        TODAY("Hoy"),
        YESTERDAY("Ayer"),
        LAST_7_DAYS("Últimos 7 días"),
        THIS_MONTH("Este mes"),
        ALL_TIME("Histórico");

        private final String label;
        CollectionPeriod(String label) { this.label = label; }
        public String label() { return label; }
        @Override public String toString() { return label; }
    }

    public enum NotificationType {
        OVERDUE,
        PROMISE,
        RENEWAL_READY
    }

    public record NotificationItem(
            NotificationType type,
            String customerId,
            String customerName,
            String loanId,
            String routeId,
            String title,
            String detail,
            BigDecimal amount,
            int priorityScore
    ) {}

    public record DailyMetrics(
            BigDecimal collectedToday,
            int pendingCustomersCount,
            int totalCustomersToday,
            BigDecimal overdueAmount,
            BigDecimal cashBalance,
            BigDecimal totalActiveDebt,
            BigDecimal totalAdministrativeCapital,
            BigDecimal digitalBalance,
            BigDecimal paperworkBalance
    ) {
        public DailyMetrics(
                BigDecimal collectedToday,
                int pendingCustomersCount,
                int totalCustomersToday,
                BigDecimal overdueAmount,
                BigDecimal cashBalance,
                BigDecimal totalActiveDebt,
                BigDecimal totalAdministrativeCapital,
                BigDecimal digitalBalance
        ) {
            this(collectedToday, pendingCustomersCount, totalCustomersToday, overdueAmount,
                    cashBalance, totalActiveDebt, totalAdministrativeCapital, digitalBalance, BigDecimal.ZERO);
        }

        /** Efectivo físico total en caja = Efectivo base operativo + Papelería disponible en caja. */
        public BigDecimal totalPhysicalCashInBox() {
            BigDecimal base = cashBalance != null ? cashBalance : BigDecimal.ZERO;
            BigDecimal pap = paperworkBalance != null ? paperworkBalance : BigDecimal.ZERO;
            return base.add(pap);
        }
    }

    public record CollectionItem(
            String customerId,
            String fullName,
            String documentNumber,
            String phone,
            String address,
            String neighborhood,
            String businessName,
            String loanId,
            BigDecimal loanTotal,
            BigDecimal loanBalance,
            String installmentId,
            int installmentNumber,
            BigDecimal installmentAmount,
            BigDecimal installmentPending,
            String statusText,
            boolean isPaidToday,
            BigDecimal overdueTotal,
            String frequency,
            String routeId,
            int orderIndex
    ) {
        public CollectionItem(
                String customerId,
                String fullName,
                String documentNumber,
                String phone,
                String address,
                String neighborhood,
                String businessName,
                String loanId,
                BigDecimal loanTotal,
                BigDecimal loanBalance,
                String installmentId,
                int installmentNumber,
                BigDecimal installmentAmount,
                BigDecimal installmentPending,
                String statusText,
                boolean isPaidToday,
                BigDecimal overdueTotal,
                String frequency,
                String routeId
        ) {
            this(customerId, fullName, documentNumber, phone, address, neighborhood, businessName,
                    loanId, loanTotal, loanBalance, installmentId, installmentNumber, installmentAmount,
                    installmentPending, statusText, isPaidToday, overdueTotal, frequency, routeId, 0);
        }

        public CollectionItem(
                String customerId,
                String fullName,
                String documentNumber,
                String phone,
                String address,
                String neighborhood,
                String businessName,
                String loanId,
                BigDecimal loanTotal,
                BigDecimal loanBalance,
                String installmentId,
                int installmentNumber,
                BigDecimal installmentAmount,
                BigDecimal installmentPending,
                String statusText,
                boolean isPaidToday,
                BigDecimal overdueTotal,
                String frequency
        ) {
            this(customerId, fullName, documentNumber, phone, address, neighborhood, businessName,
                    loanId, loanTotal, loanBalance, installmentId, installmentNumber, installmentAmount,
                    installmentPending, statusText, isPaidToday, overdueTotal, frequency, "", 0);
        }
    }

    public static String normalizeRouteId(String routeId) {
        if (routeId == null || routeId.isBlank()) {
            return "";
        }
        return routeId.trim();
    }

    public DailyMetrics getDailyMetrics(LocalDate date) {
        return getDailyMetricsForRoute(date, UserSessionContext.getSelectedRouteId());
    }

    public DailyMetrics getDailyMetricsForRoute(LocalDate date, String routeFilter) {
        String todayStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String selectedRoute = routeFilter;
        boolean filterByRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(selectedRoute) : "ALL";

        Map<String, String> loanRouteMap = loanRepository.findAll().stream()
                .collect(Collectors.toMap(LoanEntity::getId, l -> normalizeRouteId(l.getRouteId()), (a, b) -> a));

        List<PaymentEntity> todayPayments = paymentRepository.findByCreatedAtStartingWith(todayStr);

        BigDecimal collectedToday = todayPayments.stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .filter(p -> !filterByRoute || normalizedSelectedRoute.equalsIgnoreCase(loanRouteMap.getOrDefault(p.getLoanId(), "")))
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CollectionItem> items = getTodayCollectionItemsForRoute(date, routeFilter);
        List<CollectionItem> actionableToday = items.stream()
                .filter(i -> !"PRÓXIMA CUOTA".equalsIgnoreCase(i.statusText()))
                .toList();
        int pending = (int) actionableToday.stream()
                .filter(i -> !i.isPaidToday() && !"PROMESA".equalsIgnoreCase(i.statusText()))
                .count();
        int totalToday = actionableToday.isEmpty() ? items.size() : actionableToday.size();

        BigDecimal overdue = BigDecimal.ZERO;
        BigDecimal totalActiveDebt = BigDecimal.ZERO;
        for (var item : items) {
            overdue = overdue.add(item.overdueTotal());
            totalActiveDebt = totalActiveDebt.add(item.loanBalance());
        }

        var movements = cashMovementRepository.findAll();
        var allPayments = paymentRepository.findAll();
        var paymentIndex = CashLedger.index(allPayments);
        var allLoans = loanRepository.findAll();
        Map<String, LoanEntity> validLoansById = allLoans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                .collect(Collectors.toMap(LoanEntity::getId, l -> l, (a, b) -> a));

        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal digital = BigDecimal.ZERO;

        // 1. Base inicial asignada a la(s) ruta(s) (paridad con route.initialCashBase de Móvil/Supabase)
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(r.getId()))) {
                    continue;
                }
                BigDecimal base = r.getInitialCashBase();
                if (base != null && base.signum() > 0) {
                    cash = cash.add(base);
                }
            }
        }

        Set<String> renewalPaperworkMovementLoanIds = new HashSet<>();
        for (var m : movements) {
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(m.getRouteId()))) {
                continue;
            }
            String cat = m.getCategory() != null ? m.getCategory().toUpperCase().trim() : "";
            if ("RETIRO_PAPELERIA".equals(cat)) {
                // El retiro de papelería descuenta únicamente el saldo de papelería disponible,
                // sin afectar jamás el efectivo base operativo ni el Patrimonio Administrativo.
                continue;
            }
            if ("COBRO_HISTORICO".equals(cat) || "REVERSO_HISTORICO".equals(cat)) {
                // Movimientos huérfanos sin comprobante en `payment`: la app móvil nunca suma `COLLECTION`
                // desde `cash_movements`, sino que contabiliza las cuotas previas amortizadas de créditos `MIGRACION`.
                continue;
            }
            if ("PAPELERIA_RENOVACION".equals(cat) && m.getReferenceId() != null) {
                renewalPaperworkMovementLoanIds.add(m.getReferenceId());
            }
            boolean physical = CashLedger.isPhysical(m, paymentIndex);
            BigDecimal signed = BigDecimal.ZERO;
            if ("ENTRADA".equalsIgnoreCase(m.getMovementType()) || "INGRESO".equalsIgnoreCase(m.getMovementType())) {
                signed = m.getAmount();
            } else if ("SALIDA".equalsIgnoreCase(m.getMovementType()) || "EGRESO".equalsIgnoreCase(m.getMovementType())) {
                signed = m.getAmount().negate();
            }
            if (physical) {
                cash = cash.add(signed);
                // En desembolsos de crédito nuevo, la papelería retenida (capital - desembolso neto)
                // permanece en caja física como papelería separada, pero NO suma al Efectivo base operativo ni al Administrativo (Spec 008).
                if (("DESEMBOLSO".equals(cat) || "DESEMBOLSO_CREDITO".equals(cat) || "LOAN_DISBURSEMENT".equals(cat))
                        && ("SALIDA".equalsIgnoreCase(m.getMovementType()) || "EGRESO".equalsIgnoreCase(m.getMovementType()))
                        && m.getReferenceId() != null) {
                    LoanEntity loan = validLoansById.get(m.getReferenceId());
                    if (loan != null && loan.getPrincipal() != null && m.getAmount() != null) {
                        BigDecimal retainedPaperwork = loan.getPrincipal().subtract(m.getAmount());
                        if (retainedPaperwork.compareTo(BigDecimal.ZERO) > 0) {
                            cash = cash.subtract(retainedPaperwork);
                        }
                    }
                }
            } else if (!"DESCUENTO_NOMINA_DESCUADRE".equals(cat)) {
                digital = digital.add(signed);
            }
        }

        // 2. Papelería de renovaciones sincronizadas desde la nube (Móvil no emite fila separada PAPELERIA_RENOVACION)
        List<RenewalEntity> allRenewals = renewalRepository != null ? renewalRepository.findAll() : List.of();
        for (RenewalEntity ren : allRenewals) {
            LoanEntity newLoan = validLoansById.get(ren.getNewLoanId());
            if (newLoan == null) continue;
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(newLoan.getRouteId()))) {
                continue;
            }
            BigDecimal pap = ren.getPaperworkDeducted() != null ? ren.getPaperworkDeducted() : BigDecimal.ZERO;
            if (pap.signum() > 0 && !renewalPaperworkMovementLoanIds.contains(ren.getNewLoanId())) {
                cash = cash.subtract(pap);
            }
        }

        BigDecimal paperworkBalance = getPaperworkAvailableBalance(routeFilter);
        // Do not hide a negative ledger balance: preview and persisted metrics must reconcile.
        // Patrimonio Administrativo = Cartera Activa + Efectivo base operativo + Digital (NUNCA incluye papelería).
        BigDecimal administrative = totalActiveDebt.add(cash).add(digital);

        return new DailyMetrics(collectedToday, pending, totalToday, overdue, cash, totalActiveDebt, administrative, digital, paperworkBalance);
    }

    /**
     * Calcula el saldo real de papelería disponible en caja (retenida en créditos nuevos y renovaciones,
     * menos retiros de papelería). Nunca infla el Patrimonio Administrativo.
     */
    public BigDecimal getPaperworkAvailableBalance(String routeFilter) {
        boolean filterByRoute = routeFilter != null && !"ALL".equalsIgnoreCase(routeFilter);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(routeFilter) : "ALL";

        var allLoans = loanRepository.findAll();
        Map<String, LoanEntity> validLoansById = allLoans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                .collect(Collectors.toMap(LoanEntity::getId, l -> l, (a, b) -> a));

        var movements = cashMovementRepository.findAll();
        BigDecimal generated = BigDecimal.ZERO;
        BigDecimal withdrawn = BigDecimal.ZERO;
        Set<String> renewalPaperworkMovementLoanIds = new HashSet<>();

        for (var m : movements) {
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(m.getRouteId()))) {
                continue;
            }
            String cat = m.getCategory() != null ? m.getCategory().toUpperCase().trim() : "";
            BigDecimal amt = m.getAmount() != null ? m.getAmount() : BigDecimal.ZERO;

            if ("PAPELERIA_RENOVACION".equals(cat)) {
                if (m.getReferenceId() != null) {
                    renewalPaperworkMovementLoanIds.add(m.getReferenceId());
                }
                if (m.getReferenceId() == null || validLoansById.containsKey(m.getReferenceId())) {
                    generated = generated.add(amt.max(BigDecimal.ZERO));
                }
            } else if ("DESEMBOLSO".equals(cat) || "DESEMBOLSO_CREDITO".equals(cat) || "LOAN_DISBURSEMENT".equals(cat)) {
                LoanEntity loan = m.getReferenceId() != null ? validLoansById.get(m.getReferenceId()) : null;
                if (loan != null && loan.getPrincipal() != null) {
                    BigDecimal retained = loan.getPrincipal().subtract(amt);
                    if (retained.compareTo(BigDecimal.ZERO) > 0) {
                        generated = generated.add(retained);
                    }
                }
            } else if ("RETIRO_PAPELERIA".equals(cat)) {
                withdrawn = withdrawn.add(amt.max(BigDecimal.ZERO));
            }
        }

        if (renewalRepository != null) {
            for (RenewalEntity ren : renewalRepository.findAll()) {
                LoanEntity newLoan = validLoansById.get(ren.getNewLoanId());
                if (newLoan == null) continue;
                if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(newLoan.getRouteId()))) {
                    continue;
                }
                BigDecimal pap = ren.getPaperworkDeducted() != null ? ren.getPaperworkDeducted() : BigDecimal.ZERO;
                if (pap.signum() > 0 && !renewalPaperworkMovementLoanIds.contains(ren.getNewLoanId())) {
                    generated = generated.add(pap);
                }
            }
        }

        BigDecimal available = generated.subtract(withdrawn);
        return available.compareTo(BigDecimal.ZERO) > 0 ? available : BigDecimal.ZERO;
    }

    public List<CollectionItem> getTodayCollectionItems(LocalDate date) {
        return getTodayCollectionItemsForRoute(date, UserSessionContext.getSelectedRouteId());
    }

    public List<CollectionItem> getTodayCollectionItemsForRoute(LocalDate date, String routeFilter) {
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String selectedRoute = routeFilter;
        boolean filterByRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(selectedRoute) : "ALL";

        List<LoanEntity> activeLoans = loanRepository.findByStatus("ACTIVO");
        Map<String, CustomerEntity> customerMap = customerRepository.findAll().stream()
                .collect(Collectors.toMap(CustomerEntity::getId, c -> c, (a, b) -> a));

        Set<String> loansPaidToday = paymentRepository.findByCreatedAtStartingWith(dateStr).stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .map(PaymentEntity::getLoanId)
                .collect(Collectors.toSet());

        Set<String> loansWithActivePromise = (paymentPromiseRepository != null)
                ? paymentPromiseRepository.findAll().stream()
                        .filter(pr -> pr.getLoanId() != null)
                        .filter(pr -> "PENDIENTE".equalsIgnoreCase(pr.getStatus())
                                || "ACTIVA".equalsIgnoreCase(pr.getStatus())
                                || "VIGENTE".equalsIgnoreCase(pr.getStatus())
                                || "PROMESA".equalsIgnoreCase(pr.getStatus()))
                        .filter(pr -> pr.getPromisedDate() != null && pr.getPromisedDate().compareTo(dateStr) >= 0)
                        .map(PaymentPromiseEntity::getLoanId)
                        .collect(Collectors.toSet())
                : Set.of();

        List<CollectionItem> result = new ArrayList<>();

        for (var loan : activeLoans) {
            CustomerEntity customer = customerMap.get(loan.getCustomerId());
            if (customer == null) continue;

            String itemRoute = normalizeRouteId(loan.getRouteId() != null ? loan.getRouteId() : customer.getRouteId());
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(itemRoute)) {
                continue;
            }

            List<InstallmentEntity> installments = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
            if (installments.isEmpty()) continue;

            BigDecimal loanBalance = installments.stream()
                    .map(InstallmentEntity::getPendingAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal overdueTotal = BigDecimal.ZERO;
            InstallmentEntity oldestOverdue = null;
            InstallmentEntity dueTodayInst = null;
            InstallmentEntity nextFutureInst = null;

            for (var inst : installments) {
                LocalDate instDueDate = LocalDate.parse(inst.getDueDate());
                BigDecimal pending = inst.getPendingAmount();

                if (pending.signum() > 0 && instDueDate.isBefore(date)) {
                    overdueTotal = overdueTotal.add(pending);
                    if (oldestOverdue == null) {
                        oldestOverdue = inst;
                    }
                } else if (instDueDate.isEqual(date)) {
                    dueTodayInst = inst;
                } else if (pending.signum() > 0 && instDueDate.isAfter(date) && nextFutureInst == null) {
                    nextFutureInst = inst;
                }
            }

            boolean paidOnOperatingDate = loansPaidToday.contains(loan.getId())
                    || (dueTodayInst != null && dueTodayInst.getPendingAmount().compareTo(BigDecimal.ZERO) <= 0);
            boolean hasActivePromise = loansWithActivePromise.contains(loan.getId());

            InstallmentEntity targetInst;
            String statusText;
            boolean isPaidToday;

            if (oldestOverdue != null) {
                targetInst = oldestOverdue;
                statusText = "EN MORA";
                isPaidToday = false;
            } else if (paidOnOperatingDate) {
                targetInst = dueTodayInst != null ? dueTodayInst : (nextFutureInst != null ? nextFutureInst : installments.getLast());
                statusText = "PAGADO HOY";
                isPaidToday = true;
            } else if (hasActivePromise) {
                targetInst = dueTodayInst != null ? dueTodayInst : (nextFutureInst != null ? nextFutureInst : installments.getLast());
                statusText = "PROMESA";
                isPaidToday = false;
            } else if (dueTodayInst != null && dueTodayInst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0) {
                targetInst = dueTodayInst;
                statusText = "PENDIENTE";
                isPaidToday = false;
            } else if (nextFutureInst != null) {
                targetInst = nextFutureInst;
                statusText = "PRÓXIMA CUOTA";
                isPaidToday = false;
            } else {
                targetInst = installments.getLast();
                statusText = "PAGADO HOY";
                isPaidToday = true;
            }

            result.add(new CollectionItem(
                    customer.getId(),
                    customer.getFullName() != null ? customer.getFullName() : "",
                    customer.getDocumentNumber() != null ? customer.getDocumentNumber() : "",
                    customer.getPhone() != null ? customer.getPhone() : "",
                    customer.getAddress() != null ? customer.getAddress() : "",
                    customer.getNeighborhood() != null ? customer.getNeighborhood() : "",
                    customer.getBusinessName() != null ? customer.getBusinessName() : "",
                    loan.getId(),
                    loan.getTotalAgreed(),
                    loanBalance,
                    targetInst.getId(),
                    targetInst.getInstallmentNumber(),
                    targetInst.getAmount(),
                    targetInst.getPendingAmount(),
                    statusText,
                    isPaidToday,
                    overdueTotal,
                    loan.getFrequency() != null ? loan.getFrequency() : "DIARIO",
                    itemRoute,
                    customer.getOrderIndex() != null ? customer.getOrderIndex() : 0
            ));
        }

        // Respetar orden de visita sincronizado (orderIndex > 0 primero en orden ascendente)
        result.sort(Comparator
                .comparingInt((CollectionItem i) -> i.orderIndex() > 0 ? 0 : 1)
                .thenComparingInt(CollectionItem::orderIndex)
                .thenComparing(CollectionItem::fullName, Comparator.nullsLast(String::compareToIgnoreCase)));

        return result;
    }

    /**
     * Persiste la secuencia de visita (1..N) en `customer.order_index` para sincronizarla con la nube y Móvil.
     */
    @Transactional
    public void saveCustomerRouteOrder(List<String> orderedCustomerIds) {
        if (orderedCustomerIds == null || orderedCustomerIds.isEmpty()) {
            return;
        }
        int seq = 1;
        Set<String> seen = new HashSet<>();
        for (String cid : orderedCustomerIds) {
            if (cid == null || cid.isBlank() || !seen.add(cid)) {
                continue;
            }
            int assigned = seq++;
            customerRepository.findById(cid).ifPresent(c -> {
                if (!Integer.valueOf(assigned).equals(c.getOrderIndex())) {
                    c.setOrderIndex(assigned);
                    customerRepository.save(c);
                }
            });
        }
        if (settingRepository != null) {
            settingRepository.save(new SystemSettingEntity(
                    DesktopCloudSyncService.KEY_CUSTOMER_ORDER_DIRTY,
                    "true",
                    Instant.now().toString()
            ));
        }
    }

    /**
     * Calcula el monto total cobrado (pagos APLICADO/REGISTRADO) en un período seleccionable.
     */
    public BigDecimal getCollectedAmountForPeriod(CollectionPeriod period, LocalDate referenceDate, String routeFilter) {
        LocalDate ref = referenceDate != null ? referenceDate : LocalDate.now();
        CollectionPeriod effective = period != null ? period : CollectionPeriod.TODAY;
        boolean filterByRoute = routeFilter != null && !"ALL".equalsIgnoreCase(routeFilter);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(routeFilter) : "ALL";

        Map<String, String> loanRouteMap = loanRepository.findAll().stream()
                .collect(Collectors.toMap(LoanEntity::getId, l -> normalizeRouteId(l.getRouteId()), (a, b) -> a));

        LocalDate startInclusive;
        LocalDate endInclusive;
        switch (effective) {
            case TODAY -> {
                startInclusive = ref;
                endInclusive = ref;
            }
            case YESTERDAY -> {
                startInclusive = ref.minusDays(1);
                endInclusive = ref.minusDays(1);
            }
            case LAST_7_DAYS -> {
                startInclusive = ref.minusDays(6);
                endInclusive = ref;
            }
            case THIS_MONTH -> {
                startInclusive = ref.withDayOfMonth(1);
                endInclusive = ref;
            }
            case ALL_TIME -> {
                startInclusive = null;
                endInclusive = null;
            }
            default -> {
                startInclusive = ref;
                endInclusive = ref;
            }
        }

        BigDecimal total = BigDecimal.ZERO;
        for (PaymentEntity p : paymentRepository.findAll()) {
            if (!"APLICADO".equalsIgnoreCase(p.getStatus()) && !"REGISTRADO".equalsIgnoreCase(p.getStatus())) {
                continue;
            }
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(loanRouteMap.getOrDefault(p.getLoanId(), ""))) {
                continue;
            }
            if (startInclusive != null) {
                LocalDate payDate = extractLocalDate(p.getCreatedAt());
                if (payDate == null || payDate.isBefore(startInclusive) || payDate.isAfter(endInclusive)) {
                    continue;
                }
            }
            if (p.getAmount() != null) {
                total = total.add(p.getAmount());
            }
        }
        return total;
    }

    /**
     * Genera alertas accionables para la Campana de Notificaciones:
     * 1) Clientes en mora, 2) Promesas de pago para hoy o vencidas, 3) Créditos listos para renovar (>= 60% amortizado).
     */
    public List<NotificationItem> getActionableNotifications(LocalDate date, String routeFilter) {
        LocalDate ref = date != null ? date : LocalDate.now();
        String refStr = ref.format(DateTimeFormatter.ISO_LOCAL_DATE);
        boolean filterByRoute = routeFilter != null && !"ALL".equalsIgnoreCase(routeFilter);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(routeFilter) : "ALL";

        Map<String, CustomerEntity> customerMap = customerRepository.findAll().stream()
                .collect(Collectors.toMap(CustomerEntity::getId, c -> c, (a, b) -> a));

        List<LoanEntity> activeLoans = loanRepository.findByStatus("ACTIVO");
        Map<String, LoanEntity> activeLoanMap = new HashMap<>();
        List<NotificationItem> alerts = new ArrayList<>();

        for (LoanEntity loan : activeLoans) {
            CustomerEntity c = customerMap.get(loan.getCustomerId());
            if (c == null) continue;
            String itemRoute = normalizeRouteId(loan.getRouteId() != null ? loan.getRouteId() : c.getRouteId());
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(itemRoute)) {
                continue;
            }
            activeLoanMap.put(loan.getId(), loan);

            List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
            if (insts.isEmpty()) continue;

            BigDecimal overdueAmt = BigDecimal.ZERO;
            int overdueCount = 0;
            LocalDate oldestOverdueDate = null;
            BigDecimal totalPending = BigDecimal.ZERO;

            for (InstallmentEntity inst : insts) {
                BigDecimal pend = inst.getPendingAmount();
                totalPending = totalPending.add(pend);
                if (pend.signum() > 0 && inst.getDueDate() != null) {
                    try {
                        LocalDate due = LocalDate.parse(inst.getDueDate());
                        if (due.isBefore(ref)) {
                            overdueAmt = overdueAmt.add(pend);
                            overdueCount++;
                            if (oldestOverdueDate == null || due.isBefore(oldestOverdueDate)) {
                                oldestOverdueDate = due;
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }

            if (overdueCount > 0 && overdueAmt.signum() > 0) {
                long daysLate = oldestOverdueDate != null ? ChronoUnit.DAYS.between(oldestOverdueDate, ref) : 1;
                alerts.add(new NotificationItem(
                        NotificationType.OVERDUE,
                        c.getId(),
                        c.getFullName(),
                        loan.getId(),
                        itemRoute,
                        "Mora: " + overdueCount + " cuota(s) vencida(s)",
                        daysLate + " día(s) de atraso • Saldo total pendiente",
                        overdueAmt,
                        100 + (int) Math.min(daysLate, 90)
                ));
            }

            BigDecimal totalAgreed = loan.getTotalAgreed() != null ? loan.getTotalAgreed() : BigDecimal.ZERO;
            if (totalAgreed.signum() > 0 && totalPending.signum() > 0) {
                BigDecimal paid = totalAgreed.subtract(totalPending).max(BigDecimal.ZERO);
                BigDecimal ratio = paid.divide(totalAgreed, 4, RoundingMode.HALF_UP);
                if (ratio.compareTo(new BigDecimal("0.60")) >= 0) {
                    int pct = ratio.multiply(new BigDecimal("100")).setScale(0, RoundingMode.HALF_UP).intValue();
                    alerts.add(new NotificationItem(
                            NotificationType.RENEWAL_READY,
                            c.getId(),
                            c.getFullName(),
                            loan.getId(),
                            itemRoute,
                            "Listo para renovar (" + pct + "% pagado)",
                            "Saldo restante para liquidar en renovación",
                            totalPending,
                            40 + pct / 5
                    ));
                }
            }
        }

        if (paymentPromiseRepository != null) {
            for (PaymentPromiseEntity pr : paymentPromiseRepository.findAll()) {
                if (pr.getPromisedDate() == null || pr.getPromisedDate().isBlank()) continue;
                String st = pr.getStatus() != null ? pr.getStatus().toUpperCase() : "";
                if (!("PENDIENTE".equals(st) || "ACTIVA".equals(st) || "VIGENTE".equals(st) || "PROMESA".equals(st))) {
                    continue;
                }
                if (pr.getPromisedDate().compareTo(refStr) > 0) {
                    continue; // Promesa futura, aún no corresponde alertar hoy
                }
                CustomerEntity c = customerMap.get(pr.getCustomerId());
                if (c == null) continue;
                LoanEntity loan = pr.getLoanId() != null ? activeLoanMap.get(pr.getLoanId()) : null;
                String itemRoute = normalizeRouteId(loan != null && loan.getRouteId() != null ? loan.getRouteId() : c.getRouteId());
                if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(itemRoute)) {
                    continue;
                }
                boolean isToday = pr.getPromisedDate().equals(refStr);
                alerts.add(new NotificationItem(
                        NotificationType.PROMISE,
                        c.getId(),
                        c.getFullName(),
                        pr.getLoanId(),
                        itemRoute,
                        isToday ? "Promesa de pago para HOY" : "Promesa vencida (" + pr.getPromisedDate() + ")",
                        (pr.getNotes() != null && !pr.getNotes().isBlank()) ? pr.getNotes() : "Compromiso registrado en seguimiento",
                        pr.getAmount() != null ? pr.getAmount() : BigDecimal.ZERO,
                        isToday ? 85 : 95
                ));
            }
        }

        alerts.sort(Comparator
                .comparingInt(NotificationItem::priorityScore).reversed()
                .thenComparing(NotificationItem::amount, Comparator.nullsLast(Comparator.reverseOrder())));
        return alerts;
    }

    private static LocalDate extractLocalDate(String iso) {
        if (iso == null || iso.length() < 10) return null;
        try {
            return LocalDate.parse(iso.substring(0, 10));
        } catch (Exception ignored) {
            return null;
        }
    }
}
