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
import com.cartera.infrastructure.security.PasswordHasher;
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
        String now = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        LocalDate today = LocalDate.now();
        String userId = "usr-col-1";

        // 1. Asegurar usuarios del sistema (Cobrador y Administrador)
        userRepository.findByUsername("carlos").ifPresentOrElse(
                u -> {
                    if (u.getPasswordHash() == null || !u.getPasswordHash().contains("$")) {
                        u.setPasswordHash(PasswordHasher.hash("carlos123"));
                        userRepository.save(u);
                    }
                },
                () -> userRepository.save(new AppUserEntity(
                        "usr-col-1", "carlos", PasswordHasher.hash("carlos123"), "Carlos Cobrador", 1, now
                ))
        );

        userRepository.findByUsername("admin").ifPresentOrElse(
                u -> {
                    if (u.getPasswordHash() == null || !u.getPasswordHash().contains("$")) {
                        u.setPasswordHash(PasswordHasher.hash("admin123"));
                        userRepository.save(u);
                    }
                },
                () -> userRepository.save(new AppUserEntity(
                        "usr-admin-1", "admin", PasswordHasher.hash("admin123"), "Administrador General", 1, now
                ))
        );

        userRepository.findByUsername("supervisor").ifPresentOrElse(
                u -> {
                    if (u.getPasswordHash() == null || !u.getPasswordHash().contains("$")) {
                        u.setPasswordHash(PasswordHasher.hash("super123"));
                        userRepository.save(u);
                    }
                },
                () -> userRepository.save(new AppUserEntity(
                        "usr-sup-1", "supervisor", PasswordHasher.hash("super123"), "Supervisor General", 1, now
                ))
        );

        if (customerRepository.count() > 0) {
            return; // Ya hay clientes y préstamos sembrados
        }

        // 2. Ruta
        String routeId = "route-norte";
        routeRepository.save(new RouteEntity(
                routeId, "Ruta Norte - Barranquilla", userId, 1, now
        ));

        // 3. 40 Clientes y sus Préstamos (Cartera de $17.000.000 COP en calle)
        record CustomerSeed(String name, String doc, String phone, String addr, String neigh, String biz, int balance) {}

        java.util.List<CustomerSeed> seeds = java.util.List.of(
            new CustomerSeed("Juan Pérez", "1045234890", "3012345678", "Calle 54 # 43 - 21", "Boston", "Panadería El Sol", 240_000),
            new CustomerSeed("Carlos Díaz", "1047890123", "3023456789", "Cra 38 # 28 - 15", "San Roque", "Taller San Roque", 300_000),
            new CustomerSeed("María López", "1043210987", "3009876543", "Calle 68 # 52 - 10", "El Prado", "Miscelánea María", 360_000),
            new CustomerSeed("Pedro Gómez", "1049988776", "3156789012", "Calle 70 # 60 - 30", "Bellavista", "Comidas Don Pedro", 180_000),
            new CustomerSeed("Luisa Martínez", "1041122334", "3201234567", "Cra 44 # 35 - 12", "Centro", "Peluquería Estilo", 420_000),
            new CustomerSeed("Andrés Castro", "1046554433", "3104567890", "Calle 30 # 25 - 40", "Rebolo", "Frutería La Bendición", 300_000),
            new CustomerSeed("Gloria Ospina", "1048776655", "3112345678", "Cra 21 # 45 - 18", "San José", "Modistería Gloria", 480_000),
            new CustomerSeed("Jhon Jairo Moreno", "1042334455", "3145678901", "Calle 45 # 14 - 08", "Chiquinquirá", "Llantas & Moto Jhon", 240_000),
            new CustomerSeed("Diana Marcela Ruiz", "1044998811", "3167890123", "Cra 27 # 53 - 22", "Los Andes", "Papelería Ruiz", 360_000),
            new CustomerSeed("Fernando Herrera", "1046112299", "3189012345", "Calle 63 # 24 - 15", "Lucero", "Carnicería El Buen Corte", 320_000),
            new CustomerSeed("Claudia Patricia Vega", "1047223388", "3001122334", "Cra 16 # 38 - 50", "La Victoria", "Cafetería & Desayunos", 500_000),
            new CustomerSeed("Óscar Iván Morales", "1048334477", "3012233445", "Calle 40 # 19 - 33", "Montes", "Zapatería El Calzado", 450_000),
            new CustomerSeed("Paola Andrea Silva", "1049445566", "3023344556", "Cra 33 # 47 - 05", "Chiquinquirá", "Boutique Paola", 400_000),
            new CustomerSeed("Ricardo Antonio Ramos", "1040556677", "3044455667", "Calle 51 # 36 - 19", "San Roque", "Ferretería El Tornillo", 600_000),
            new CustomerSeed("Sandra Milena Torres", "1041667788", "3055566778", "Cra 41 # 58 - 42", "Boston", "Droguería San Jorge", 350_000),
            new CustomerSeed("Wilson Javier Mendoza", "1042778899", "3136677889", "Calle 72 # 48 - 11", "El Prado", "Taller de Frenos Wilson", 550_000),
            new CustomerSeed("Adriana Lucía Romero", "1043889900", "3147788990", "Cra 46 # 65 - 08", "Bellavista", "Pastelería Dulce Arte", 400_000),
            new CustomerSeed("Gustavo Adolfo Peña", "1044001122", "3158899001", "Calle 37 # 22 - 14", "San José", "Comidas Rápidas Tavo", 450_000),
            new CustomerSeed("Luz Dary Quintero", "1045112233", "3169900112", "Cra 23 # 41 - 25", "Rebolo", "Abarrotes Doña Luz", 500_000),
            new CustomerSeed("Héctor Fabio Valencia", "1046223344", "3170011223", "Calle 48 # 17 - 30", "La Victoria", "Repuestos Valencia", 300_000),
            new CustomerSeed("Yolanda Betancur", "1047334455", "3181122334", "Cra 14 # 35 - 19", "Montes", "Confecciones Yoly", 480_000),
            new CustomerSeed("Mauricio Restrepo", "1048445566", "3192233445", "Calle 56 # 26 - 12", "Lucero", "Minimercado Mau", 420_000),
            new CustomerSeed("Tatiana Cárdenas", "1049556677", "3203344556", "Cra 30 # 50 - 45", "Los Andes", "Sala de Belleza Tati", 600_000),
            new CustomerSeed("Gabriel Jaime Ochoa", "1040667788", "3214455667", "Calle 60 # 41 - 18", "Boston", "Pizzería Don Gabriel", 360_000),
            new CustomerSeed("Martha Cecilia Salazar", "1041778899", "3225566778", "Cra 42 # 32 - 04", "Centro", "Bazar Central", 540_000),
            new CustomerSeed("Diego Fernando Rincón", "1042889900", "3236677889", "Calle 44 # 16 - 29", "San Roque", "Lavado de Motos Diego", 480_000),
            new CustomerSeed("Esperanza Guzmán", "1043990011", "3007788990", "Cra 20 # 43 - 15", "Chiquinquirá", "Frutas & Verduras Espe", 420_000),
            new CustomerSeed("Albeiro Cardona", "1044112200", "3018899001", "Calle 65 # 55 - 20", "El Prado", "Taller Eléctrico Albeiro", 600_000),
            new CustomerSeed("Mónica Janeth Pineda", "1045223311", "3029900112", "Cra 48 # 62 - 10", "Bellavista", "Floristería Pétalos", 450_000),
            new CustomerSeed("César Augusto Montoya", "1046334422", "3040011223", "Calle 33 # 21 - 35", "San José", "Asadero & Broaster César", 450_000),
            new CustomerSeed("Nelly Rocío Parra", "1047445533", "3051122334", "Cra 25 # 39 - 18", "Rebolo", "Miscelánea La Fe", 640_000),
            new CustomerSeed("Javier Enrique Arango", "1048556644", "3102233445", "Calle 49 # 18 - 40", "La Victoria", "Taller de Bicicletas Javi", 512_000),
            new CustomerSeed("Sonia Margarita Duque", "1049667755", "3113344556", "Cra 15 # 34 - 22", "Montes", "Arepas de Choclo Sonia", 480_000),
            new CustomerSeed("Víctor Manuel Correa", "1040778866", "3124455667", "Calle 58 # 27 - 09", "Lucero", "Vidriería y Espejos Víctor", 320_000),
            new CustomerSeed("Marisol Echeverri", "1041889977", "3135566778", "Cra 32 # 52 - 30", "Los Andes", "Pañalera Huellitas", 608_000),
            new CustomerSeed("Fabián Andrés Cano", "1042990088", "3146677889", "Calle 52 # 38 - 14", "San Roque", "Salsamentaria El Paisa", 448_000),
            new CustomerSeed("Olga Lucía Giraldo", "1043001199", "3157788990", "Cra 43 # 57 - 25", "Boston", "Variedades Olguita", 500_000),
            new CustomerSeed("Rodrigo Alberto Maya", "1044112299", "3168899001", "Calle 71 # 50 - 16", "El Prado", "Barbería Vintage Maya", 350_000),
            new CustomerSeed("Blanca Inés Holguín", "1045223399", "3179900112", "Cra 47 # 64 - 15", "Bellavista", "Ropa & Accesorios Blanca", 400_000),
            new CustomerSeed("Raúl Emilio Zapata", "1046334499", "3180011223", "Calle 39 # 20 - 28", "San José", "Almacén de Aves Don Raúl", 242_000)
        );

        int idx = 1;
        for (CustomerSeed s : seeds) {
            int installmentAmount = 15_000;
            if (s.balance % 20_000 == 0) installmentAmount = 20_000;
            else if (s.balance % 10_000 == 0) installmentAmount = 10_000;

            int unpaidCount = s.balance / installmentAmount;
            if (s.balance % installmentAmount != 0) unpaidCount++;
            int paidCount = 10;
            int totalInstallments = paidCount + unpaidCount;
            BigDecimal totalAgreed = BigDecimal.valueOf((long) totalInstallments * installmentAmount);
            BigDecimal principal = totalAgreed.divide(BigDecimal.valueOf(1.20), 0, java.math.RoundingMode.HALF_UP);
            BigDecimal interest = totalAgreed.subtract(principal);

            createCustomerWithLoan(
                    "cust-" + idx, s.name, s.doc, s.phone,
                    s.addr, s.neigh, "Barranquilla", s.biz,
                    routeId, userId,
                    principal, BigDecimal.valueOf(0.20), interest, totalAgreed,
                    totalInstallments, "DIARIO", BigDecimal.valueOf(installmentAmount),
                    today.minusDays(paidCount), paidCount
            );
            idx++;
        }
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
