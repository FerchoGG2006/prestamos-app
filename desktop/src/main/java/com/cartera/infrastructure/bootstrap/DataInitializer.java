package com.cartera.infrastructure.bootstrap;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/** Seeds fictitious demo data on an empty database. Disable with cartera.demo-data.enabled=false. */
@Component
@ConditionalOnProperty(name = "cartera.demo-data.enabled", havingValue = "true", matchIfMissing = false)
public class DataInitializer implements CommandLineRunner {
    private final AppUserRepository userRepository;
    private final RouteRepository routeRepository;
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;

    public DataInitializer(AppUserRepository userRepository,
                           RouteRepository routeRepository,
                           CustomerRepository customerRepository,
                           LoanRepository loanRepository,
                           InstallmentRepository installmentRepository) {
        this.userRepository = userRepository;
        this.routeRepository = routeRepository;
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
    }

    @Override
    public void run(String... args) {
        if (customerRepository.count() > 0) {
            return; // Ya hay datos inicializados
        }

        String now = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        LocalDate today = LocalDate.now();

        // 1. Usuario
        String userId = "usr-col-1";
        userRepository.save(new AppUserEntity(
                userId, "carlos", "hash_carlos_123", "Carlos Cobrador", 1, now
        ));

        // 2. Ruta
        String routeId = "route-norte";
        routeRepository.save(new RouteEntity(
                routeId, "Ruta Norte - Barranquilla", userId, 1, now
        ));

        // 3. Clientes y sus préstamos
        createCustomerWithLoan(
                "cust-1", "Juan Pérez", "1045234890", "3012345678",
                "Calle 54 # 43 - 21", "Boston", "Barranquilla", "Panadería El Sol",
                routeId, userId,
                BigDecimal.valueOf(300_000), BigDecimal.valueOf(0.20), BigDecimal.valueOf(60_000), BigDecimal.valueOf(360_000),
                24, "DIARIO", BigDecimal.valueOf(15_000), today, 5
        );

        createCustomerWithLoan(
                "cust-2", "Carlos Díaz", "1047890123", "3023456789",
                "Cra 38 # 28 - 15", "San Roque", "Barranquilla", "Taller San Roque",
                routeId, userId,
                BigDecimal.valueOf(500_000), BigDecimal.valueOf(0.20), BigDecimal.valueOf(100_000), BigDecimal.valueOf(600_000),
                30, "DIARIO", BigDecimal.valueOf(20_000), today, 2
        );

        createCustomerWithLoan(
                "cust-3", "María Gómez", "1048555123", "3034567890",
                "Calle 72 # 50 - 10", "El Prado", "Barranquilla", "Frutería La Bendición",
                routeId, userId,
                BigDecimal.valueOf(200_000), BigDecimal.valueOf(0.20), BigDecimal.valueOf(40_000), BigDecimal.valueOf(240_000),
                24, "DIARIO", BigDecimal.valueOf(10_000), today, 0
        );

        createCustomerWithLoan(
                "cust-4", "Andrés Rodríguez", "1049999888", "3045678901",
                "Cra 43 # 60 - 32", "Bellavista", "Barranquilla", "Miscelánea Central",
                routeId, userId,
                BigDecimal.valueOf(150_000), BigDecimal.valueOf(0.20), BigDecimal.valueOf(30_000), BigDecimal.valueOf(180_000),
                18, "DIARIO", BigDecimal.valueOf(10_000), today.minusDays(2), 0
        );
    }

    private void createCustomerWithLoan(String custId, String fullName, String doc, String phone,
                                        String address, String neighborhood, String city, String business,
                                        String routeId, String userId,
                                        BigDecimal principal, BigDecimal rate, BigDecimal interest, BigDecimal total,
                                        int installmentCount, String frequency, BigDecimal installmentAmount,
                                        LocalDate startDate, int paidInstallmentsCount) {
        String nowStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);

        CustomerEntity customer = new CustomerEntity(
                custId, fullName, doc, phone, null, address, neighborhood, city,
                "Comerciante", business, "Cliente verificado", "ACTIVO", routeId, userId, nowStr
        );
        customerRepository.save(customer);

        String loanId = UUID.randomUUID().toString();
        LoanEntity loan = new LoanEntity(
                loanId, custId, routeId, userId, null, "NUEVO",
                principal, rate, interest, total, installmentCount, frequency,
                startDate.format(DateTimeFormatter.ISO_LOCAL_DATE), null, "ACTIVO", nowStr
        );
        loanRepository.save(loan);

        // Generar cuotas
        for (int i = 1; i <= installmentCount; i++) {
            LocalDate dueDate = startDate.plusDays(i - 1);
            boolean isPrePaid = i <= paidInstallmentsCount;
            BigDecimal paid = isPrePaid ? installmentAmount : BigDecimal.ZERO;
            String status = isPrePaid ? "PAGADA" : "PENDIENTE";

            InstallmentEntity inst = new InstallmentEntity(
                    UUID.randomUUID().toString(),
                    loanId,
                    i,
                    dueDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                    installmentAmount,
                    paid,
                    status
            );
            installmentRepository.save(inst);
        }
    }
}
