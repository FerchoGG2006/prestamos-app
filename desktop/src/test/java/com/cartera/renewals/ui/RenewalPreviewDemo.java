package com.cartera.renewals.ui;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.ui.views.RenewLoanDialog;
import javafx.application.Application;
import javafx.scene.control.TextField;
import javafx.stage.Stage;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.UUID;

/** Manual, native UI fixture. Always uses a new throwaway SQLite DB, never office data. */
public final class RenewalPreviewDemo {
    public static void main(String[] args) { Application.launch(Demo.class, args); }

    public static class Demo extends Application {
        private ConfigurableApplicationContext context;

        @Override public void start(Stage owner) throws Exception {
            var db = Files.createTempDirectory("cartera-renewal-preview-").resolve("demo.db");
            context = new SpringApplicationBuilder(CarteraInfrastructureApplication.class)
                    .web(WebApplicationType.NONE)
                    .run("--spring.datasource.url=jdbc:sqlite:" + db.toAbsolutePath(),
                            "--cartera.demo-data.enabled=true");
            UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Demo aislada", "ADMIN"));
            String today = LocalDate.now().toString(), route = "demo-renovacion";
            context.getBean(RouteRepository.class).save(new RouteEntity(route, "Demo aislada", "usr-col-1", 1, today));
            String customer = context.getBean(CustomerRepository.class).findAll().getFirst().getId();
            String loanId = UUID.randomUUID().toString();
            var loan = context.getBean(LoanRepository.class).save(new LoanEntity(loanId, customer, route, "usr-col-1",
                    null, "NUEVO", new BigDecimal("800000"), new BigDecimal("0.4"), new BigDecimal("320000"),
                    new BigDecimal("1120000"), 1, "MENSUAL", today, LocalDate.now().plusMonths(1).toString(), "ACTIVO", today));
            context.getBean(InstallmentRepository.class).save(new InstallmentEntity(UUID.randomUUID().toString(), loanId, 1,
                    LocalDate.now().plusMonths(1).toString(), new BigDecimal("1120000"), new BigDecimal("500000"), "PARCIAL"));
            context.getBean(CashMovementRepository.class).save(new CashMovementEntity(UUID.randomUUID().toString(), route,
                    "usr-col-1", null, "INGRESO", "BASE_DEMO", new BigDecimal("500000"), null, "Base ficticia", today));
            var dialog = new RenewLoanDialog(loan, "Cliente ficticio · caso $700.000", context.getBean(RenewLoanUseCase.class),
                    context.getBean(InstallmentRepository.class), context.getBean(SystemSettingRepository.class), owner, result -> {});
            dialog.setTitle("DEMO AISLADA — Resumen de renovación JavaFX");
            dialog.show();
            dialog.getScene().getRoot().applyCss();
            ((TextField) dialog.getScene().lookup("#renewal-principal")).setText("700000");
            ((TextField) dialog.getScene().lookup("#renewal-total-rate")).setText("40");
            ((TextField) dialog.getScene().lookup("#renewal-installments")).setText("2");
        }

        @Override public void stop() {
            UserSessionContext.clear();
            if (context != null) context.close();
        }
    }
}
