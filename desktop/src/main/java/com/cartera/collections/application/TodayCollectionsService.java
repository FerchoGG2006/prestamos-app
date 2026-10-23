package com.cartera.collections.application;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentPromiseRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
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

    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository) {
        this(customerRepository, loanRepository, installmentRepository, paymentRepository, cashMovementRepository, null);
    }

    @Autowired
    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository,
                                   PaymentPromiseRepository paymentPromiseRepository) {
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.paymentPromiseRepository = paymentPromiseRepository;
    }

    public record DailyMetrics(
            BigDecimal collectedToday,
            int pendingCustomersCount,
            int totalCustomersToday,
            BigDecimal overdueAmount,
            BigDecimal cashBalance,
            BigDecimal totalActiveDebt,
            BigDecimal totalAdministrativeCapital
    ) {}

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
            String routeId
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
                String frequency
        ) {
            this(customerId, fullName, documentNumber, phone, address, neighborhood, businessName,
                    loanId, loanTotal, loanBalance, installmentId, installmentNumber, installmentAmount,
                    installmentPending, statusText, isPaidToday, overdueTotal, frequency, "route-norte");
        }
    }

    public static String normalizeRouteId(String routeId) {
        if (routeId == null || routeId.isBlank() || "route-1".equalsIgnoreCase(routeId.trim())) {
            return "route-norte";
        }
        return routeId.trim();
    }

    public DailyMetrics getDailyMetrics(LocalDate date) {
        String todayStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String selectedRoute = UserSessionContext.getSelectedRouteId();
        boolean filterByRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute);
        String normalizedSelectedRoute = filterByRoute ? normalizeRouteId(selectedRoute) : "ALL";

        Map<String, String> loanRouteMap = loanRepository.findAll().stream()
                .collect(Collectors.toMap(LoanEntity::getId, l -> normalizeRouteId(l.getRouteId()), (a, b) -> a));

        List<PaymentEntity> todayPayments = paymentRepository.findByCreatedAtStartingWith(todayStr);

        BigDecimal collectedToday = todayPayments.stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .filter(p -> !filterByRoute || normalizedSelectedRoute.equalsIgnoreCase(loanRouteMap.getOrDefault(p.getLoanId(), "route-norte")))
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CollectionItem> items = getTodayCollectionItems(date);
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
        BigDecimal cash = BigDecimal.ZERO;
        for (var m : movements) {
            if (filterByRoute && !normalizedSelectedRoute.equalsIgnoreCase(normalizeRouteId(m.getRouteId()))) {
                continue;
            }
            if ("ENTRADA".equalsIgnoreCase(m.getMovementType()) || "INGRESO".equalsIgnoreCase(m.getMovementType())) {
                cash = cash.add(m.getAmount());
            } else if ("SALIDA".equalsIgnoreCase(m.getMovementType()) || "EGRESO".equalsIgnoreCase(m.getMovementType())) {
                cash = cash.subtract(m.getAmount());
            }
        }

        BigDecimal administrative = totalActiveDebt.add(cash.max(BigDecimal.ZERO));

        return new DailyMetrics(collectedToday, pending, totalToday, overdue, cash, totalActiveDebt, administrative);
    }

    public List<CollectionItem> getTodayCollectionItems(LocalDate date) {
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String selectedRoute = UserSessionContext.getSelectedRouteId();
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
                    customer.getFullName(),
                    customer.getDocumentNumber(),
                    customer.getPhone(),
                    customer.getAddress(),
                    customer.getNeighborhood(),
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
                    itemRoute
            ));
        }

        return result;
    }
}
