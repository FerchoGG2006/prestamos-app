package com.cartera.qa;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.ui.CarteraApplication;
import javafx.application.Application;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

/** Starts the complete native product against a new isolated fictitious office. */
public final class OfficeQaLauncher {
    public static final String PASSWORD = "QaLocal2026!"; // Fictitious local QA credentials only.

    public static ConfigurableApplicationContext open() {
        return new SpringApplicationBuilder(CarteraInfrastructureApplication.class)
                .web(WebApplicationType.NONE).run();
    }

    public static Path isolate(String name) throws Exception {
        Path root = Path.of(System.getProperty("qa.workspace", ".")).toAbsolutePath().normalize();
        Path home = Files.createTempDirectory(Files.createDirectories(root.resolve("desktop/build/qa")), name + "-");
        Path data = Files.createDirectories(home.resolve(".sistema-cartera"));
        Files.createDirectories(home.resolve("tmp"));
        System.setProperty("user.home", home.toString());
        System.setProperty("java.io.tmpdir", home.resolve("tmp").toString());
        System.setProperty("spring.datasource.url", "jdbc:sqlite:" + data.resolve("cartera.db"));
        System.setProperty("cartera.demo-data.enabled", "false");
        System.out.println("QA_ISOLATED_HOME=" + home);
        return home;
    }

    public static void seed(ConfigurableApplicationContext context) {
        String date = LocalDate.now().toString();
        var users = context.getBean(AppUserRepository.class);
        users.save(new AppUserEntity("usr-admin-1", "qaadmin", PasswordHasher.hash(PASSWORD), "ADMIN OFICINA QA", 1, date));
        users.save(new AppUserEntity("usr-col-1", "qacobrador", PasswordHasher.hash(PASSWORD), "COBRADOR QA NORTE", 1, date));
        users.save(new AppUserEntity("usr-col-2", "qaotro", PasswordHasher.hash(PASSWORD), "COBRADOR QA SUR", 1, date));
        var routes = context.getBean(RouteRepository.class);
        routes.save(new RouteEntity("route-norte", "QA NORTE", "usr-col-1", 1, date));
        routes.save(new RouteEntity("route-sur", "QA SUR", "usr-col-2", 1, date));
        var settings = context.getBean(SystemSettingRepository.class);
        for (var pair : new String[][] { {"office_setup_completed", "true"}, {"company_name", "OFICINA FICTICIA QA"},
                {"paperwork_enabled", "true"}, {"paperwork_fee", "5000"}, {"default_interest_percent", "20"},
                {"max_new_loan_amount", "5000000"} }) {
            settings.save(new SystemSettingEntity(pair[0], pair[1], date));
        }
    }

    public static void main(String[] args) throws Exception {
        isolate("ui-office");
        try (var context = open()) { seed(context); }
        Application.launch(CarteraApplication.class);
    }
}
