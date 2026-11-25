package com.cartera.loans.application;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.renewals.application.RenewLoanUseCase.RenewLoanCommand;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = CarteraInfrastructureApplication.class)
class MigrationPaydayAndRenewalFixedDateTest {

    private static Path tempDb;

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) throws Exception {
        tempDb = Files.createTempFile("kredia-mig-payday-fixed-", ".db");
        tempDb.toFile().deleteOnExit();
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDb.toAbsolutePath());
        registry.add("cartera.demo-data.enabled", () -> "false");
    }

    @Autowired private AuthService authService;
    @Autowired private AppUserRepository userRepository;
    @Autowired private RouteRepository routeRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private LoanRepository loanRepository;
    @Autowired private InstallmentRepository installmentRepository;
    @Autowired private CreateLoanUseCase createLoanUseCase;
    @Autowired private RenewLoanUseCase renewLoanUseCase;

    private String adminId;
    private String routeId;
    private String customerId;

    @BeforeEach
    void setUp() {
        adminId = "adm-012";
        routeId = "rt-012";
        customerId = "cust-012";
        if (userRepository.findById(adminId).isEmpty()) {
            userRepository.saveAndFlush(new AppUserEntity(
                    adminId, "admin012", PasswordHasher.hash("Test1234!"), "Admin 012", 1, "2026-11-24T08:00:00"
            ));
            authService.assignRole(adminId, "ADMIN");
        }
        if (routeRepository.findById(routeId).isEmpty()) {
            RouteEntity r = new RouteEntity(routeId, "Ruta 012", adminId, 1, "2026-11-24T08:00:00");
            r.setInitialCashBase(new BigDecimal("1000000"));
            routeRepository.saveAndFlush(r);
        }
        if (customerRepository.findById(customerId).isEmpty()) {
            customerRepository.saveAndFlush(new CustomerEntity(
                    customerId, "Cliente Viernes", "1065999012", "3001234567", "",
                    "Calle 1", "Centro", "Valledupar", "Comercio", "Tienda", "",
                    "ACTIVO", routeId, adminId, "2026-11-24T08:00:00"
            ));
        }
        UserSessionContext.setSession(new UserSession(adminId, "admin012", "Admin 012", "ADMIN"));
    }

    @AfterEach
    void tearDown() {
        UserSessionContext.clear();
    }

    @Test
    void weeklyFridayCardEnteredOnTuesdayWithTwoPaidInstallmentsAnchorsCorrectly() {
        // Martes 2026-11-24 -> próximo Viernes es 2026-11-27
        LocalDate tuesday = LocalDate.of(2026, 11, 24);
        LocalDate friday = CreateLoanUseCase.upcomingWeekday(tuesday, DayOfWeek.FRIDAY);
        assertEquals(LocalDate.of(2026, 11, 27), friday);
        assertEquals(LocalDate.of(2026, 11, 24), CreateLoanUseCase.upcomingWeekday(tuesday, DayOfWeek.TUESDAY));
        assertEquals(LocalDate.of(2026, 11, 30), CreateLoanUseCase.upcomingWeekday(tuesday, DayOfWeek.MONDAY));

        var cmd = new CreateLoanUseCase.CreateLoanCommand(
                customerId,
                routeId,
                adminId,
                new BigDecimal("300000"),
                new BigDecimal("0.2000"),
                new BigDecimal("360000"),
                6,
                "SEMANAL",
                tuesday,
                adminId,
                BigDecimal.ZERO,
                true,
                Set.of(1, 2),
                null,
                "Migración cartulina física",
                friday
        );

        LoanEntity loan = createLoanUseCase.execute(cmd);
        assertEquals("MIGRACION", loan.getOperationType());
        assertEquals("2026-11-06", loan.getStartDate());
        assertEquals("2026-12-18", loan.getEndDate());

        List<InstallmentEntity> insts = installmentRepository.findByLoanId(loan.getId()).stream()
                .sorted(Comparator.comparingInt(InstallmentEntity::getInstallmentNumber))
                .toList();
        assertEquals(6, insts.size());

        assertEquals("2026-11-13", insts.get(0).getDueDate());
        assertEquals("PAGADA", insts.get(0).getStatus());
        assertEquals("2026-11-20", insts.get(1).getDueDate());
        assertEquals("PAGADA", insts.get(1).getStatus());
        assertEquals("2026-11-27", insts.get(2).getDueDate());
        assertEquals("PENDIENTE", insts.get(2).getStatus());
        assertEquals("2026-12-04", insts.get(3).getDueDate());
        assertEquals("2026-12-11", insts.get(4).getDueDate());
        assertEquals("2026-12-18", insts.get(5).getDueDate());
    }

    @Test
    void dailyBiweeklyAndMonthlyAnchoredMigrationSchedulesRespectSundaysAndMonthEnd() {
        // Diario saltando domingo 2026-11-22
        var dailyPlan = createLoanUseCase.simulateAnchoredMigrationPlan(
                new BigDecimal("120000"), 5, "DIARIO", LocalDate.of(2026, 11, 24), Set.of(1, 2)
        );
        assertEquals(
                List.of(
                        LocalDate.of(2026, 11, 21),
                        LocalDate.of(2026, 11, 23),
                        LocalDate.of(2026, 11, 24),
                        LocalDate.of(2026, 11, 25),
                        LocalDate.of(2026, 11, 26)
                ),
                dailyPlan.stream().map(CreateLoanUseCase.InstallmentPlanItem::dueDate).toList()
        );
        assertEquals(
                LocalDate.of(2026, 11, 20),
                createLoanUseCase.computeAnchoredStartDate(LocalDate.of(2026, 11, 24), 5, "DIARIO", Set.of(1, 2))
        );

        // Quincenal
        var biweeklyPlan = createLoanUseCase.simulateAnchoredMigrationPlan(
                new BigDecimal("240000"), 4, "QUINCENAL", LocalDate.of(2026, 11, 30), Set.of(1)
        );
        assertEquals(
                List.of(
                        LocalDate.of(2026, 11, 15),
                        LocalDate.of(2026, 11, 30),
                        LocalDate.of(2026, 12, 15),
                        LocalDate.of(2026, 12, 30)
                ),
                biweeklyPlan.stream().map(CreateLoanUseCase.InstallmentPlanItem::dueDate).toList()
        );

        // Mensual fin de mes
        var monthlyPlan = createLoanUseCase.simulateAnchoredMigrationPlan(
                new BigDecimal("240000"), 3, "MENSUAL", LocalDate.of(2026, 3, 31), Set.of(1, 2)
        );
        assertEquals(
                List.of(
                        LocalDate.of(2026, 1, 31),
                        LocalDate.of(2026, 2, 28),
                        LocalDate.of(2026, 3, 31)
                ),
                monthlyPlan.stream().map(CreateLoanUseCase.InstallmentPlanItem::dueDate).toList()
        );
    }

    @Test
    void renewalWithFixedDateCreatesSingleInstallmentDueOnChosenDate() {
        LoanEntity original = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customerId, routeId, adminId,
                new BigDecimal("200000"), new BigDecimal("0.2000"), new BigDecimal("240000"),
                4, "SEMANAL", LocalDate.of(2026, 11, 10), adminId, new BigDecimal("10000")
        ));

        LocalDate fixedTarget = LocalDate.of(2026, 12, 15);
        RenewLoanCommand renCmd = new RenewLoanCommand(
                original.getId(),
                new BigDecimal("400000"),
                new BigDecimal("0.2000"),
                new BigDecimal("480000"),
                1,
                "FECHA FIJA",
                fixedTarget,
                new BigDecimal("20000"),
                adminId
        );
        var preview = renewLoanUseCase.preview(renCmd);
        var res = renewLoanUseCase.execute(renCmd.withPreview(preview));

        LoanEntity closedPrev = loanRepository.findById(original.getId()).orElseThrow();
        assertEquals("RENOVADO", closedPrev.getStatus());

        LoanEntity renewed = loanRepository.findById(res.newLoanId()).orElseThrow();
        assertEquals("FECHA FIJA", renewed.getFrequency());
        assertEquals(1, renewed.getInstallmentCount());
        assertEquals("2026-12-15", renewed.getEndDate());

        List<InstallmentEntity> newInsts = installmentRepository.findByLoanId(renewed.getId());
        assertEquals(1, newInsts.size());
        assertEquals("2026-12-15", newInsts.get(0).getDueDate());
        assertEquals(0, new BigDecimal("480000").compareTo(newInsts.get(0).getAmount()));
    }
}
