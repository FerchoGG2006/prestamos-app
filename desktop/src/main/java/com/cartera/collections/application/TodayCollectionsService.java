package com.cartera.collections.application;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TodayCollectionsService {
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final CashMovementRepository cashMovementRepository;

    public TodayCollectionsService(CustomerRepository customerRepository,
                                   LoanRepository loanRepository,
                                   InstallmentRepository installmentRepository,
                                   PaymentRepository paymentRepository,
                                   CashMovementRepository cashMovementRepository) {
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.cashMovementRepository = cashMovementRepository;
    }

    public record DailyMetrics(
            BigDecimal collectedToday,
            int pendingCustomersCount,
            int totalCustomersToday,
            BigDecimal overdueAmount,
            BigDecimal cashBalance
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
            BigDecimal overdueTotal
    ) {}

    public DailyMetrics getDailyMetrics(LocalDate date) {
        String todayStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        List<PaymentEntity> todayPayments = paymentRepository.findByCreatedAtStartingWith(todayStr);

        BigDecimal collectedToday = todayPayments.stream()
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CollectionItem> items = getTodayCollectionItems(date);
        int pending = (int) items.stream().filter(i -> !i.isPaidToday()).count();

        // Hecho objetivo (no una regla de mora): suma de cuotas con vencimiento anterior a hoy y saldo pendiente.
        BigDecimal overdue = BigDecimal.ZERO;
        for (var item : items) {
            overdue = overdue.add(item.overdueTotal());
        }

        var movements = cashMovementRepository.findByCreatedAtStartingWith(todayStr);
        BigDecimal cash = BigDecimal.ZERO;
        for (var m : movements) {
            if ("ENTRADA".equalsIgnoreCase(m.getMovementType())) {
                cash = cash.add(m.getAmount());
            } else if ("SALIDA".equalsIgnoreCase(m.getMovementType())) {
                cash = cash.subtract(m.getAmount());
            }
        }

        return new DailyMetrics(collectedToday, pending, items.size(), overdue, cash);
    }

    public List<CollectionItem> getTodayCollectionItems(LocalDate date) {
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        List<LoanEntity> activeLoans = loanRepository.findByStatus("ACTIVO");
        Map<String, CustomerEntity> customerMap = customerRepository.findAll().stream()
                .collect(Collectors.toMap(CustomerEntity::getId, c -> c, (a, b) -> a));

        List<CollectionItem> result = new ArrayList<>();

        for (var loan : activeLoans) {
            CustomerEntity customer = customerMap.get(loan.getCustomerId());
            if (customer == null) continue;

            List<InstallmentEntity> installments = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
            if (installments.isEmpty()) continue;

            BigDecimal loanBalance = installments.stream()
                    .map(InstallmentEntity::getPendingAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            // Prioridad: la cuota vencida pendiente más antigua (la que el asignador paga primero),
            // luego la de hoy, luego la primera pendiente.
            BigDecimal overdueTotal = BigDecimal.ZERO;
            InstallmentEntity oldestOverdue = null;
            for (var inst : installments) {
                if (inst.getPendingAmount().signum() > 0 && LocalDate.parse(inst.getDueDate()).isBefore(date)) {
                    overdueTotal = overdueTotal.add(inst.getPendingAmount());
                    if (oldestOverdue == null) oldestOverdue = inst;
                }
            }

            InstallmentEntity todayOrPending = oldestOverdue;
            if (todayOrPending == null) {
                for (var inst : installments) {
                    if (inst.getDueDate().equals(dateStr)) {
                        todayOrPending = inst;
                        break;
                    }
                }
            }
            if (todayOrPending == null) {
                for (var inst : installments) {
                    if (inst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0) {
                        todayOrPending = inst;
                        break;
                    }
                }
            }
            if (todayOrPending == null) {
                todayOrPending = installments.getLast();
            }

            boolean isPaidToday = todayOrPending.getPendingAmount().compareTo(BigDecimal.ZERO) == 0;
            LocalDate dueDate = LocalDate.parse(todayOrPending.getDueDate());
            String statusText;

            if (isPaidToday) {
                statusText = "AL DÍA / PAGADO";
            } else if (dueDate.isBefore(date)) {
                statusText = "VENCIDA";
            } else if (dueDate.equals(date)) {
                statusText = "COBRO HOY";
            } else {
                statusText = "PENDIENTE";
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
                    todayOrPending.getId(),
                    todayOrPending.getInstallmentNumber(),
                    todayOrPending.getAmount(),
                    todayOrPending.getPendingAmount(),
                    statusText,
                    isPaidToday,
                    overdueTotal
            ));
        }

        return result;
    }
}
