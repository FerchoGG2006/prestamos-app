package com.cartera.ui;

import com.cartera.CarteraInfrastructureApplication;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
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

/** Native JavaFX entry point. There is no WebView, browser or localhost user interface. */
public final class CarteraApplication extends Application {
    private ConfigurableApplicationContext context;
    @Override public void init() {
        context = new SpringApplicationBuilder(CarteraInfrastructureApplication.class)
                .web(WebApplicationType.NONE).headless(false).run();
    }
    @Override public void start(Stage stage) {
        var root = new BorderPane(); root.setStyle("-fx-background-color: #0f172a;");
        root.setLeft(sidebar()); root.setTop(topBar()); root.setCenter(dashboard());
        var scene = new Scene(root, 1280, 800);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        stage.setTitle("Sistema de Cartera"); stage.setMinWidth(1024); stage.setMinHeight(680);
        stage.setScene(scene); stage.show();
    }
    private VBox sidebar() {
        var box = new VBox(8); box.getStyleClass().add("sidebar");
        var title = new Label("SISTEMA DE\nCARTERA"); title.getStyleClass().add("brand");
        box.getChildren().addAll(title, nav("Inicio"), nav("Clientes"), nav("Créditos"), nav("Cobros de hoy"),
                nav("Rutas"), nav("Caja"), nav("Liquidaciones"), nav("Reportes"), nav("Auditoría"), nav("Configuración"));
        return box;
    }
    private Button nav(String text) { var button = new Button(text); button.getStyleClass().add("nav-button"); button.setMaxWidth(Double.MAX_VALUE); return button; }
    private HBox topBar() {
        var bar = new HBox(); bar.getStyleClass().add("top-bar"); bar.setAlignment(Pos.CENTER_LEFT);
        var heading = new Label("Dashboard"); heading.getStyleClass().add("page-title");
        var status = new Label("● OFFLINE — SQLite local"); status.getStyleClass().add("status-ok");
        HBox.setHgrow(heading, Priority.ALWAYS); bar.getChildren().addAll(heading, status); return bar;
    }
    private VBox dashboard() {
        var body = new VBox(18); body.setPadding(new Insets(28));
        var title = new Label("Operación de hoy"); title.getStyleClass().add("section-title");
        var metrics = new HBox(16, metric("Cobrado hoy", "$ 0"), metric("Clientes por cobrar", "0"), metric("Mora", "$ 0"), metric("Caja", "$ 0"));
        var note = new Label("La interfaz JavaFX está activa. Los datos financieros se conectarán a SQLite mediante los casos de uso del dominio.");
        note.getStyleClass().add("muted"); body.getChildren().addAll(title, metrics, note); return body;
    }
    private VBox metric(String label, String value) { var card = new VBox(8, new Label(label), new Label(value)); card.getStyleClass().add("metric-card"); card.getChildren().get(1).getStyleClass().add("metric-value"); return card; }
    @Override public void stop() { if (context != null) context.close(); Platform.exit(); }
}
