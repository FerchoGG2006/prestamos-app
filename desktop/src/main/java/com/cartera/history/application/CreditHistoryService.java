package com.cartera.history.application;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentAllocationEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentAllocationRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Servicio de Consulta y Evaluación de Historial Crediticio.
 * Permite verificar el comportamiento histórico de pago de un cliente mediante su cédula.
 * Clasifica fáctica y objetivamente si la persona "pagó bien" o "pagó mal"
 * sin inventar reglas arbitrarias de mora.
 */
@Service
public class CreditHistoryService {

    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;

    public CreditHistoryService(CustomerRepository customerRepository,
                                LoanRepository loanRepository,
                                InstallmentRepository installmentRepository) {
        this(customerRepository, loanRepository, installmentRepository, null, null);
    }

    @Autowired
    public CreditHistoryService(CustomerRepository customerRepository,
                                LoanRepository loanRepository,
                                InstallmentRepository installmentRepository,
                                PaymentRepository paymentRepository,
                                PaymentAllocationRepository paymentAllocationRepository) {
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
    }

    public enum RepaymentRating {
        BUEN_PAGADOR("★ BUEN PAGADOR / PUNTUAL", "#059669", "#ecfdf5", "#a7f3d0"),
        REGULAR("⚠ REGULAR (CON ATRASOS)", "#d97706", "#fffbeb", "#fde68a"),
        EN_MORA("🚨 MAL PAGADOR / EN MORA", "#dc2626", "#fef2f2", "#fecaca"),
        SIN_HISTORIAL("ℹ CLIENTE NUEVO (SIN HISTORIAL)", "#2563eb", "#eff6ff", "#bfdbfe");

        private final String label;
        private final String textColor;
        private final String bgColor;
        private final String borderColor;

        RepaymentRating(String label, String textColor, String bgColor, String borderColor) {
            this.label = label;
            this.textColor = textColor;
            this.bgColor = bgColor;
            this.borderColor = borderColor;
        }

        public String getLabel() { return label; }
        public String getTextColor() { return textColor; }
        public String getBgColor() { return bgColor; }
        public String getBorderColor() { return borderColor; }
    }

    public record LoanHistoryItem(
            LoanEntity loan,
            BigDecimal totalAgreed,
            BigDecimal totalPaid,
            BigDecimal remainingBalance,
            int totalInstallments,
            int paidInstallments,
            int overdueInstallments,
            int maxDelayDays,
            String behaviorVerdict,
            String behaviorColor,
            List<InstallmentEntity> installments
    ) {}

    public record CreditHistoryReport(
            CustomerEntity customer,
            RepaymentRating rating,
            String ratingExplanation,
            int totalLoansCount,
            int completedLoansCount,
            int activeLoansCount,
            BigDecimal totalBorrowed,
            BigDecimal totalAgreed,
            BigDecimal totalPaid,
            BigDecimal currentRemainingBalance,
            BigDecimal currentOverdueAmount,
            int maxOverdueDaysRecorded,
            List<LoanHistoryItem> loans
    ) {}

    /**
     * Consulta el historial crediticio a partir del número de cédula/documento.
     */
    public Optional<CreditHistoryReport> getReportByDocument(String documentNumber) {
        if (documentNumber == null || documentNumber.isBlank()) {
            return Optional.empty();
        }
        return customerRepository.findByDocumentNumber(documentNumber.trim())
                .map(this::buildReportForCustomer);
    }

    /**
     * Consulta el historial crediticio a partir del ID de cliente.
     */
    public Optional<CreditHistoryReport> getReportByCustomerId(String customerId) {
        if (customerId == null || customerId.isBlank()) {
            return Optional.empty();
        }
        return customerRepository.findById(customerId.trim())
                .map(this::buildReportForCustomer);
    }

    /**
     * Busca clientes por nombre o cédula para soporte de autocompletado y selección rápida.
     */
    public List<CustomerEntity> searchCustomers(String query) {
        if (query == null || query.isBlank()) {
            return customerRepository.findAll();
        }
        String q = query.trim();
        return customerRepository.findByFullNameContainingIgnoreCaseOrDocumentNumberContaining(q, q);
    }

    private CreditHistoryReport buildReportForCustomer(CustomerEntity customer) {
        List<LoanEntity> allLoans = loanRepository.findByCustomerId(customer.getId());
        LocalDate today = LocalDate.now();

        // Ordenar préstamos del más reciente al más antiguo
        allLoans.sort((a, b) -> {
            String da = a.getStartDate() != null ? a.getStartDate() : "";
            String db = b.getStartDate() != null ? b.getStartDate() : "";
            return db.compareTo(da);
        });

        int totalLoansCount = allLoans.size();
        int completedLoansCount = 0;
        int activeLoansCount = 0;

        BigDecimal totalBorrowed = BigDecimal.ZERO;
        BigDecimal totalAgreed = BigDecimal.ZERO;
        BigDecimal totalPaid = BigDecimal.ZERO;
        BigDecimal currentRemainingBalance = BigDecimal.ZERO;
        BigDecimal currentOverdueAmount = BigDecimal.ZERO;
        int maxOverdueDaysRecorded = 0;
        boolean hasActiveOverdueLoans = false;
        boolean hasPastLoansWithDelay = false;

        List<LoanHistoryItem> loanItems = new ArrayList<>();

        for (LoanEntity loan : allLoans) {
            totalBorrowed = totalBorrowed.add(loan.getPrincipal() != null ? loan.getPrincipal() : BigDecimal.ZERO);
            totalAgreed = totalAgreed.add(loan.getTotalAgreed() != null ? loan.getTotalAgreed() : BigDecimal.ZERO);

            String st = loan.getStatus() != null ? loan.getStatus().trim() : "";
            boolean isActive = "ACTIVO".equalsIgnoreCase(st) || "ACTIVE".equalsIgnoreCase(st);
            boolean isRenewed = "RENOVADO".equalsIgnoreCase(st);
            boolean isCompleted = "FINALIZADO".equalsIgnoreCase(st)
                    || "PAGADO".equalsIgnoreCase(st)
                    || "PAID".equalsIgnoreCase(st)
                    || "CANCELADO".equalsIgnoreCase(st)
                    || isRenewed;

            if (isActive) {
                activeLoansCount++;
            } else if (isCompleted) {
                completedLoansCount++;
            }

            // Construir mapa de fechas reales de pago por cuota (si existen allocations)
            Map<String, LocalDate> paidDateByInstallment = new HashMap<>();
            if (paymentRepository != null && paymentAllocationRepository != null) {
                Map<String, LocalDate> paymentDates = paymentRepository.findByLoanId(loan.getId()).stream()
                        .filter(p -> p.getCreatedAt() != null && p.getCreatedAt().length() >= 10)
                        .collect(Collectors.toMap(
                                PaymentEntity::getId,
                                p -> {
                                    try {
                                        return LocalDate.parse(p.getCreatedAt().substring(0, 10));
                                    } catch (Exception e) {
                                        return today;
                                    }
                                },
                                (a, b) -> a.isAfter(b) ? a : b
                        ));

                for (PaymentEntity p : paymentRepository.findByLoanId(loan.getId())) {
                    LocalDate pDate = paymentDates.get(p.getId());
                    if (pDate != null) {
                        for (PaymentAllocationEntity alloc : paymentAllocationRepository.findByPaymentId(p.getId())) {
                            paidDateByInstallment.merge(alloc.getInstallmentId(), pDate, (d1, d2) -> d1.isAfter(d2) ? d1 : d2);
                        }
                    }
                }
            }

            List<InstallmentEntity> installments = installmentRepository.findByLoanId(loan.getId());
            installments.sort(Comparator.comparingInt(i -> i.getInstallmentNumber() != null ? i.getInstallmentNumber() : 0));

            BigDecimal loanPaid = BigDecimal.ZERO;
            BigDecimal loanPending = BigDecimal.ZERO;
            BigDecimal loanOverdueAmount = BigDecimal.ZERO;
            int paidInstCount = 0;
            int overdueInstCount = 0;
            int latePaidInstCount = 0;
            int maxLoanDelayDays = 0;

            for (InstallmentEntity inst : installments) {
                BigDecimal pending = inst.getPendingAmount() != null ? inst.getPendingAmount() : BigDecimal.ZERO;
                BigDecimal paid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
                loanPaid = loanPaid.add(paid);
                loanPending = loanPending.add(pending);

                if (pending.compareTo(BigDecimal.ZERO) <= 0) {
                    paidInstCount++;
                }

                if (inst.getDueDate() != null && !inst.getDueDate().isBlank()) {
                    try {
                        LocalDate dueDate = LocalDate.parse(inst.getDueDate());
                        if (pending.compareTo(BigDecimal.ZERO) > 0 && today.isAfter(dueDate)) {
                            // Cuota aún pendiente y vencida
                            overdueInstCount++;
                            loanOverdueAmount = loanOverdueAmount.add(pending);
                            long days = ChronoUnit.DAYS.between(dueDate, today);
                            if (days > maxLoanDelayDays) {
                                maxLoanDelayDays = (int) days;
                            }
                        } else if (pending.compareTo(BigDecimal.ZERO) <= 0) {
                            // Cuota ya pagada: verificar si se pagó después de su fecha de vencimiento
                            LocalDate paidDate = paidDateByInstallment.get(inst.getId());
                            if (paidDate != null && paidDate.isAfter(dueDate)) {
                                latePaidInstCount++;
                                long days = ChronoUnit.DAYS.between(dueDate, paidDate);
                                if (days > maxLoanDelayDays) {
                                    maxLoanDelayDays = (int) days;
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }

            totalPaid = totalPaid.add(loanPaid);
            if (isActive) {
                currentRemainingBalance = currentRemainingBalance.add(loanPending);
                if (overdueInstCount > 0) {
                    hasActiveOverdueLoans = true;
                    currentOverdueAmount = currentOverdueAmount.add(loanOverdueAmount);
                }
                if (latePaidInstCount > 0) {
                    hasPastLoansWithDelay = true;
                }
            }

            if (maxLoanDelayDays > maxOverdueDaysRecorded) {
                maxOverdueDaysRecorded = maxLoanDelayDays;
            }

            // Dictamen específico para este crédito
            String behaviorVerdict;
            String behaviorColor;

            if (isRenewed) {
                if (maxLoanDelayDays > 0) {
                    hasPastLoansWithDelay = true;
                    behaviorVerdict = "↻ Renovado (con atraso previo de " + maxLoanDelayDays + " días)";
                    behaviorColor = "#d97706";
                } else {
                    behaviorVerdict = "↻ Renovado (cumplimiento al día)";
                    behaviorColor = "#4338ca";
                }
            } else if (isCompleted) {
                if (maxLoanDelayDays == 0) {
                    behaviorVerdict = "✓ Pagó Excelente (Puntual sin demoras)";
                    behaviorColor = "#059669";
                } else {
                    hasPastLoansWithDelay = true;
                    behaviorVerdict = "⚠ Pagó con Atraso (" + maxLoanDelayDays + " días máx)";
                    behaviorColor = "#d97706";
                }
            } else if (isActive) {
                if (overdueInstCount > 0) {
                    behaviorVerdict = "🚨 Cuotas Vencidas (" + overdueInstCount + " en mora - " + maxLoanDelayDays + " días)";
                    behaviorColor = "#dc2626";
                } else if (latePaidInstCount > 0) {
                    behaviorVerdict = "⚠ Al Día (con atraso previo de " + maxLoanDelayDays + " días)";
                    behaviorColor = "#d97706";
                } else {
                    behaviorVerdict = "✓ Al Día (Cuotas al corriente)";
                    behaviorColor = "#2563eb";
                }
            } else {
                behaviorVerdict = "• Liquidado";
                behaviorColor = "#64748b";
            }

            loanItems.add(new LoanHistoryItem(
                    loan,
                    loan.getTotalAgreed(),
                    loanPaid,
                    loanPending,
                    installments.size(),
                    paidInstCount,
                    overdueInstCount + latePaidInstCount,
                    maxLoanDelayDays,
                    behaviorVerdict,
                    behaviorColor,
                    installments
            ));
        }

        // Calificación global del cliente
        RepaymentRating rating;
        String ratingExplanation;

        if (totalLoansCount == 0) {
            rating = RepaymentRating.SIN_HISTORIAL;
            ratingExplanation = "Cliente nuevo sin préstamos registrados previamente en la cartera. No registra incumplimientos.";
        } else if (hasActiveOverdueLoans) {
            rating = RepaymentRating.EN_MORA;
            ratingExplanation = "El cliente presenta cuotas vencidas e impagas en su crédito activo (" + maxOverdueDaysRecorded + " días de mora máx). Alto riesgo crediticio.";
        } else if (hasPastLoansWithDelay) {
            rating = RepaymentRating.REGULAR;
            ratingExplanation = "El cliente ha cumplido sus créditos, pero presentó atrasos en sus fechas de pago programadas (" + maxOverdueDaysRecorded + " días de demora histórica).";
        } else {
            rating = RepaymentRating.BUEN_PAGADOR;
            ratingExplanation = "Historial crediticio excelente. Pagos puntuales, sin cuotas vencidas registradas y cumplimiento total de acuerdos.";
        }

        return new CreditHistoryReport(
                customer,
                rating,
                ratingExplanation,
                totalLoansCount,
                completedLoansCount,
                activeLoansCount,
                totalBorrowed,
                totalAgreed,
                totalPaid,
                currentRemainingBalance,
                currentOverdueAmount,
                maxOverdueDaysRecorded,
                loanItems
        );
    }
}
