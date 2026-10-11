package com.cartera.ui;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.ui.views.CustomersView;
import com.cartera.ui.views.DashboardView;
import com.cartera.ui.views.LoansView;
import com.cartera.ui.views.TodayCollectionsView;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.HashMap;
import java.util.Map;

/** Native JavaFX entry point for Sistema de Cartera. */
public final class CarteraApplication extends Application {
    private ConfigurableApplicationContext context;
    private BorderPane root;
    private Label topTitle;
    private final Map<String, Button> navButtons = new HashMap<>();

    private DashboardView dashboardView;
    private TodayCollectionsView todayCollectionsView;
    private CustomersView customersView;
    private LoansView loansView;

    @Override
    public void init() throws Exception {
        java.nio.file.Files.createDirectories(
                java.nio.file.Paths.get(System.getProperty("user.home"), ".sistema-cartera")
        );
        context = new SpringApplicationBuilder(CarteraInfrastructureApplication.class)
                .web(WebApplicationType.NONE)
                .headless(false)
                .run();
    }

    @Override
    public void start(Stage stage) {
        root = new BorderPane();
        root.setStyle("-fx-background-color: #0f172a;");

        // Inicializar vistas con servicios inyectados de Spring
        var collectionsService = context.getBean(TodayCollectionsService.class);
        var paymentUseCase = context.getBean(RecordPaymentUseCase.class);
        var customerRepository = context.getBean(CustomerRepository.class);
        var loanRepository = context.getBean(LoanRepository.class);

        dashboardView = new DashboardView(collectionsService, () -> navigateTo("Cobros de hoy"));
        todayCollectionsView = new TodayCollectionsView(collectionsService, paymentUseCase, stage, () -> {
            dashboardView.refresh();
            if (loansView != null) loansView.refresh();
        });
        customersView = new CustomersView(customerRepository);
        loansView = new LoansView(loanRepository, customerRepository);

        root.setLeft(sidebar());
        root.setTop(topBar());

        // Iniciar en Dashboard
        navigateTo("Inicio");

        var scene = new Scene(root, 1280, 800);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());

        stage.setTitle("Sistema de Cartera y Cobros");
        stage.setMinWidth(1024);
        stage.setMinHeight(680);
        stage.setScene(scene);
        stage.show();
    }

    private VBox sidebar() {
        var box = new VBox(6);
        box.getStyleClass().add("sidebar");

        var title = new Label("SISTEMA DE\nCARTERA");
        title.getStyleClass().add("brand");

        box.getChildren().add(title);
        box.getChildren().addAll(
                createNavButton("Inicio"),
                createNavButton("Cobros de hoy"),
                createNavButton("Clientes"),
                createNavButton("Créditos"),
                createNavButton("Rutas"),
                createNavButton("Caja"),
                createNavButton("Liquidaciones"),
                createNavButton("Reportes"),
                createNavButton("Auditoría"),
                createNavButton("Configuración")
        );

        return box;
    }

    private Button createNavButton(String name) {
        var button = new Button(name);
        button.getStyleClass().add("nav-button");
        button.setMaxWidth(Double.MAX_VALUE);
        button.setOnAction(e -> navigateTo(name));
        navButtons.put(name, button);
        return button;
    }

    private HBox topBar() {
        var bar = new HBox();
        bar.getStyleClass().add("top-bar");
        bar.setAlignment(Pos.CENTER_LEFT);

        topTitle = new Label("Inicio");
        topTitle.getStyleClass().add("page-title");

        var status = new Label("● OFFLINE — SQLite Activo");
        status.getStyleClass().add("status-ok");

        HBox.setHgrow(topTitle, Priority.ALWAYS);
        bar.getChildren().addAll(topTitle, status);
        return bar;
    }

    private void navigateTo(String viewName) {
        topTitle.setText(viewName);

        // Actualizar estilo visual del botón seleccionado
        navButtons.forEach((key, btn) -> {
            btn.getStyleClass().remove("nav-button-active");
            if (key.equals(viewName)) {
                btn.getStyleClass().add("nav-button-active");
            }
        });

        Node viewNode;
        switch (viewName) {
            case "Cobros de hoy":
                todayCollectionsView.refreshData();
                viewNode = todayCollectionsView;
                break;
            case "Clientes":
                customersView.refresh();
                viewNode = customersView;
                break;
            case "Créditos":
                loansView.refresh();
                viewNode = loansView;
                break;
            case "Inicio":
            default:
                dashboardView.refresh();
                viewNode = dashboardView;
                break;
        }

        root.setCenter(viewNode);
    }

    @Override
    public void stop() {
        if (context != null) {
            context.close();
        }
        Platform.exit();
    }
}
