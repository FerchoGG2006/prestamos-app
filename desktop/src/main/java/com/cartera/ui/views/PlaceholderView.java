package com.cartera.ui.views;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Label;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

/** Honest placeholder for modules that are not implemented yet (instead of silently showing another screen). */
public class PlaceholderView extends StackPane {
    public PlaceholderView(String moduleName) {
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        VBox card = new VBox(10);
        card.setAlignment(Pos.CENTER);
        card.getStyleClass().add("table-card");
        card.setMaxWidth(520);
        card.setMaxHeight(240);
        card.setPadding(new Insets(36));

        Label icon = new Label("\uD83D\uDEA7");
        icon.setStyle("-fx-font-size: 34px;");
        Label title = new Label(moduleName + " \u2014 en desarrollo");
        title.getStyleClass().add("section-title");
        Label desc = new Label("Este m\u00f3dulo a\u00fan no est\u00e1 disponible en la versi\u00f3n de escritorio.\nSe habilitar\u00e1 cuando su flujo est\u00e9 verificado.");
        desc.getStyleClass().add("muted");
        desc.setWrapText(true);
        desc.setStyle("-fx-text-alignment: center;");

        card.getChildren().addAll(icon, title, desc);
        getChildren().add(card);
    }
}
