package com.cartera.customers.application;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase.CreateLoanCommand;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;

/**
 * Crea un cliente y su primer préstamo (o cartulina física migrada) en una sola transacción atómica.
 * Si el desembolso o migración falla por cualquier regla (tope, cierre, permisos), el cliente también se revierte.
 */
@Service
public class CreateCustomerWithLoanUseCase {

    private final CreateCustomerUseCase createCustomerUseCase;
    private final CreateLoanUseCase createLoanUseCase;

    public CreateCustomerWithLoanUseCase(
            CreateCustomerUseCase createCustomerUseCase,
            CreateLoanUseCase createLoanUseCase
    ) {
        this.createCustomerUseCase = createCustomerUseCase;
        this.createLoanUseCase = createLoanUseCase;
    }

    public record Result(CustomerEntity customer, LoanEntity loan) {}

    @Transactional
    public Result execute(
            CreateCustomerUseCase.CreateCustomerCommand customerCommand,
            BigDecimal principal,
            BigDecimal interestRate,
            BigDecimal totalAgreed,
            int installmentCount,
            String frequency,
            LocalDate startDate,
            BigDecimal paperworkFee
    ) {
        return execute(
                customerCommand, principal, interestRate, totalAgreed, installmentCount,
                frequency, startDate, paperworkFee, false, Set.of(), null, null, null
        );
    }

    @Transactional
    public Result execute(
            CreateCustomerUseCase.CreateCustomerCommand customerCommand,
            BigDecimal principal,
            BigDecimal interestRate,
            BigDecimal totalAgreed,
            int installmentCount,
            String frequency,
            LocalDate startDate,
            BigDecimal paperworkFee,
            boolean isMigration,
            Set<Integer> paidInstallmentNumbers,
            String cardPhotoPath,
            String migrationNotes,
            LocalDate nextDueDate
    ) {
        CustomerEntity customer = createCustomerUseCase.execute(customerCommand);
        CreateLoanCommand loanCommand = new CreateLoanCommand(
                customer.getId(),
                customer.getRouteId(),
                customer.getCollectorId(),
                principal,
                interestRate,
                totalAgreed,
                installmentCount,
                frequency,
                startDate,
                customerCommand.authorUserId(),
                paperworkFee,
                isMigration,
                paidInstallmentNumbers,
                cardPhotoPath,
                migrationNotes,
                nextDueDate
        );
        LoanEntity loan = createLoanUseCase.execute(loanCommand);
        return new Result(customer, loan);
    }
}
